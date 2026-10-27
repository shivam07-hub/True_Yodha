from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.routers import jobs
from app.services import application_yes


class _FakeSkillsDb:
    """The `skills` read the preview makes to score the rows a save would write."""

    def table(self, _name: str) -> "_FakeSkillsDb":
        return self

    def select(self, _cols: str) -> "_FakeSkillsDb":
        return self

    def in_(self, _col: str, keys: list[str]) -> "_FakeSkillsDb":
        self._keys = keys
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[
            {"id": 1, "taxonomy_key": k, "practice_mode": None, "skill_kind": "hard"} for k in self._keys
        ])


class _FakeJobsRepository:
    @property
    def client(self) -> _FakeSkillsDb:
        return _FakeSkillsDb()

    def get_user_skill_map(self, user_id: str) -> dict[str, int]:
        # The preview reads this to place the caller against the job (match_score).
        return {"Python (Programming Language)": 3}


def test_import_preview_requires_description() -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: _FakeJobsRepository()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/import/preview",
                json={"role_name": "Role", "job_description": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_import_preview_returns_suggestions(monkeypatch) -> None:
    repo = _FakeJobsRepository()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    monkeypatch.setattr(
        jobs.job_importer,
        "preview_imported_job",
        lambda db, body: {
            "role_name": body.role_name,
            "company_name": body.company_name,
            "location": body.location,
            "job_description": body.job_description,
            "primary_skills": [
                {
                    "label": "Python (Programming Language)",
                    "taxonomy_key": "Python (Programming Language)",
                    "confidence": 0.91,
                }
            ],
            "secondary_skills": [],
            "emerging_skills": [
                {
                    "label": "LangGraph",
                    "normalized_label": "langgraph",
                    "skill_type": "secondary",
                    "confidence": 0.78,
                }
            ],
            "warnings": [],
        },
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/import/preview",
                json={
                    "source_url": "https://example.com/job",
                    "source_platform": "generic",
                    "role_name": "Data Engineer",
                    "company_name": "Acme",
                    "location": "India",
                    "job_description": "Build data products with Python.",
                    "capture_method": "visible_page",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["role_name"] == "Data Engineer"
    assert body["primary_skills"][0]["taxonomy_key"] == "Python (Programming Language)"
    assert body["emerging_skills"][0]["normalized_label"] == "langgraph"
    # One must-have the user holds at 3 of the 4 asked → the job's provisional match_score.
    assert body["match_score"] == 75
    assert body["matched_skills"] == ["Python (Programming Language)"]


def test_import_job_calls_service_and_returns_application(monkeypatch) -> None:
    repo = _FakeJobsRepository()
    judged: list = []
    monkeypatch.setattr(jobs.apply.on_demand, "open_job_eval", lambda r, uid, jid: judged.append((r, uid, jid)))
    repo.save_imported_job = lambda user_id, body: {
        "id": 1,
        "job_id": "ext_abc",
        "title": "Data Engineer",
        "company": "Acme",
        "job_description": "Build data products with Python.",
        "status": "pending",
        "applied_at": None,
        "response_at": None,
        "checkin_sent_at": None,
        "notes": None,
        "created_at": "2026-04-24T00:00:00+00:00",
    }
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/import",
                json={
                    "source_url": "https://example.com/job",
                    "source_platform": "generic",
                    "role_name": "Data Engineer",
                    "company_name": "Acme",
                    "location": "India",
                    "job_description": "Build data products with Python.",
                    "primary_skills": ["Python (Programming Language)"],
                    "secondary_skills": [],
                    "emerging_skills": [],
                    "capture_method": "visible_page",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["job_id"] == "ext_abc"
    # A saved job is judged (claim + enqueue, after the response) so an
    # application to it can count as qualified.
    assert judged == [(repo, "u1", "ext_abc")]


def _override_auth_and_repo(repo: object) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo


def test_update_imported_details_rejects_scraped_job() -> None:
    _override_auth_and_repo(_FakeJobsRepository())
    try:
        with TestClient(app) as client:
            r = client.patch("/jobs/applications/job_scraped_1/imported-details",
                             json={"title": "Sales Manager"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 422  # only ext_ imports are editable


def test_update_imported_details_rejects_invalid_title() -> None:
    _override_auth_and_repo(_FakeJobsRepository())
    try:
        with TestClient(app) as client:
            r = client.patch("/jobs/applications/ext_abc/imported-details",
                             json={"title": "https://x.com/job"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 422


def test_update_imported_details_404_when_not_owned() -> None:
    repo = _FakeJobsRepository()
    repo.update_imported_job_details = lambda user_id, job_id, *, title, company: None
    _override_auth_and_repo(repo)
    try:
        with TestClient(app) as client:
            r = client.patch("/jobs/applications/ext_abc/imported-details",
                             json={"title": "Sales Manager"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 404


def test_update_imported_details_success() -> None:
    repo = _FakeJobsRepository()
    seen: dict = {}

    def _update(user_id, job_id, *, title, company):
        seen.update(user_id=user_id, job_id=job_id, title=title, company=company)
        return {"job_title": title or "Old", "company_name": company or "MOPID"}

    repo.update_imported_job_details = _update
    _override_auth_and_repo(repo)
    try:
        with TestClient(app) as client:
            r = client.patch("/jobs/applications/ext_abc/imported-details",
                             json={"title": "Enterprise Sales Manager", "company": "MOPID"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    body = r.json()
    assert body["job_title"] == "Enterprise Sales Manager"
    assert body["company"] == "MOPID"
    assert seen["job_id"] == "ext_abc" and seen["user_id"] == "u1"


class _StatusRepo:
    """Just enough of JobsRepository for PUT /jobs/applications/{job_id}."""

    def __init__(self, prior_status: str, applied_at: str | None = None) -> None:
        self.status = prior_status
        self.applied_at = applied_at
        self.answered: list[str] = []

    def _row(self) -> dict:
        return {
            "id": 1, "job_id": "ext_abc", "status": self.status, "source": "user_discovery",
            "applied_at": self.applied_at, "response_at": None, "checkin_sent_at": None, "notes": None,
            "created_at": "2026-10-01T00:00:00+00:00",
            "jobs": {"job_title": "Data Engineer", "company_name": "Acme"},
        }

    def get_application_with_job(self, _uid: str, _job_id: str) -> dict:
        return self._row()

    def upsert_application(self, _uid: str, _job_id: str, updates: dict) -> None:
        self.status = updates.get("status", self.status)
        if "applied_at" in updates:
            self.applied_at = updates["applied_at"]

    def answer_apply_intents(self, _uid: str, job_id: str) -> None:
        self.answered.append(job_id)


def _patch_yes_effects(monkeypatch) -> tuple[list, list, list]:
    judged: list = []
    frozen: list = []
    steps: list = []
    monkeypatch.setattr(application_yes.on_demand, "open_job_eval", lambda r, uid, jid: judged.append(jid))
    monkeypatch.setattr(
        application_yes.cv_of_record, "record_on_apply", lambda uid, jid, *, since: frozen.append(jid)
    )
    monkeypatch.setattr(application_yes.core_loop, "record_step", lambda *a: steps.append(a))
    return judged, frozen, steps


def _put_status(
    monkeypatch, prior: str, status: str, surface: str | None = "extension",
    applied_at: str | None = None,
):
    repo = _StatusRepo(prior, applied_at)
    judged, frozen, steps = _patch_yes_effects(monkeypatch)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    body = {"status": status} if surface is None else {"status": status, "surface": surface}
    try:
        with TestClient(app) as client:
            response = client.put("/jobs/applications/ext_abc", json=body)
    finally:
        app.dependency_overrides.clear()
    _put_status.steps = steps
    return response, repo, judged, frozen


def test_first_applied_freezes_the_cv_and_queues_the_judge(monkeypatch) -> None:
    """The extension's "I applied" and the web's "Did you apply?" Yes share this
    write. The first move to applied is the forward-pass door for a job saved
    before a save queued the judge."""
    response, repo, judged, frozen = _put_status(monkeypatch, "saved", "applied")
    assert response.status_code == 200
    assert response.json()["status"] == "applied"
    assert repo.answered == ["ext_abc"]
    assert frozen == ["ext_abc"]
    assert judged == ["ext_abc"]
    # The door the Yes came through is recorded once, server-side.
    assert _put_status.steps == [("u1", "ext_abc", "applied", "extension")]


def test_an_unnamed_door_is_recorded_as_none(monkeypatch) -> None:
    _put_status(monkeypatch, "saved", "applied", surface=None)
    assert _put_status.steps == [("u1", "ext_abc", "applied", None)]


def test_a_repeat_applied_queues_nothing(monkeypatch) -> None:
    response, _repo, judged, frozen = _put_status(
        monkeypatch, "applied", "applied", applied_at="2026-10-01T00:00:00+00:00"
    )
    assert response.status_code == 200
    assert judged == [] and frozen == []
    assert _put_status.steps == []


def test_dragging_saved_straight_to_interviewing_is_a_yes(monkeypatch) -> None:
    response, repo, judged, frozen = _put_status(monkeypatch, "saved", "interviewing", surface="tracker")
    assert response.status_code == 200
    assert repo.applied_at is not None
    assert frozen == ["ext_abc"] and judged == ["ext_abc"]
    assert _put_status.steps == [("u1", "ext_abc", "applied", "tracker")]


def test_dragging_back_to_saved_withdraws_the_yes(monkeypatch) -> None:
    response, repo, judged, frozen = _put_status(
        monkeypatch, "applied", "saved", surface="tracker", applied_at="2026-10-01T00:00:00+00:00"
    )
    assert response.status_code == 200
    assert response.json()["applied_at"] is None
    assert repo.applied_at is None
    assert judged == [] and frozen == [] and _put_status.steps == []


# ── a pasted link that is a listing Myro holds (FD1, 2026-10-20) ─────────────

class _LinkedRepo(_FakeJobsRepository):
    def __init__(self, live: bool) -> None:
        self.live = live
        self.upserts: list[tuple] = []
        self.minted: list = []

    def listings_for_link(self, job_ids):
        return [{"job_id": job_ids[0]}] if self.live else []

    def upsert_application(self, user_id, job_id, updates):
        self.upserts.append((user_id, job_id, updates))

    def answer_apply_intents(self, user_id, job_id):
        pass

    def get_application_with_job(self, user_id, job_id):
        return {"id": 7, "job_id": job_id, "status": self.upserts[-1][2]["status"],
                "applied_at": self.upserts[-1][2].get("applied_at"),
                "source": "user_discovery", "created_at": "2026-10-20T00:00:00+00:00",
                "jobs": {"job_title": "Business Analyst", "company_name": "Kotak Mahindra Bank",
                         "job_description": "Own the digital banking analytics."}}

    def save_imported_job(self, user_id, body):
        self.minted.append(body)
        return {"id": 8, "job_id": "ext_new", "title": body.role_name, "company": body.company_name,
                "job_description": body.job_description, "status": "saved", "applied_at": None,
                "response_at": None, "checkin_sent_at": None, "notes": None,
                "created_at": "2026-10-20T00:00:00+00:00"}


def _import_linked(monkeypatch, repo, status="saved", platform=None):
    judged, _frozen, steps = _patch_yes_effects(monkeypatch)
    _import_linked.steps = steps
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/import", json={
                "source_url": "https://hcbt.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/270652",
                "role_name": "Business Analyst", "company_name": "Kotak Mahindra Bank",
                "job_description": "Own the digital banking analytics.",
                "listing_job_id": "270652", "status": status, "source_platform": platform,
            })
    finally:
        app.dependency_overrides.clear()
    return response, judged


def test_a_link_to_a_live_listing_saves_that_listing_not_a_copy(monkeypatch) -> None:
    repo = _LinkedRepo(live=True)
    response, judged = _import_linked(monkeypatch, repo, status="applied")
    assert response.status_code == 200
    assert response.json()["job_id"] == "270652"
    assert repo.minted == [], "no ext_ copy of a listing Myro holds"
    assert repo.upserts[0] == ("u1", "270652", {"status": "applied", "source": "user_discovery"})
    assert judged == ["270652"], "the saved listing still gets its verdict"


def test_a_job_logged_as_already_applied_is_a_yes_through_the_logged_door(monkeypatch) -> None:
    """Applied elsewhere counts (Shivam, 2026-10-27). The import wrote the stage;
    the Yes follows it, once, with its door named."""
    repo = _LinkedRepo(live=True)
    response, _judged = _import_linked(monkeypatch, repo, status="applied")
    assert response.status_code == 200
    assert response.json()["applied_at"] is not None
    assert repo.upserts[-1][2]["applied_at"] is not None
    assert _import_linked.steps == [("u1", "270652", "applied", "logged")]


def test_a_job_saved_by_import_is_not_a_yes(monkeypatch) -> None:
    repo = _LinkedRepo(live=True)
    _response, judged = _import_linked(monkeypatch, repo, status="saved")
    assert len(repo.upserts) == 1
    assert judged == ["270652"]
    assert _import_linked.steps == []


def test_a_listing_that_closed_since_the_read_imports_the_text(monkeypatch) -> None:
    repo = _LinkedRepo(live=False)
    response, _ = _import_linked(monkeypatch, repo)
    assert response.json()["job_id"] == "ext_new"
    assert len(repo.minted) == 1 and repo.upserts == []


def test_a_listing_pasted_at_the_onboarding_door_is_the_door_s_import(monkeypatch) -> None:
    """The first-job step accepts a non-`ext_` job only from an onboarding
    source; a listing pasted at the door is exactly that."""
    from app.services.onboarding_first_role import FIRST_ROLE_SOURCES

    repo = _LinkedRepo(live=True)
    _import_linked(monkeypatch, repo, platform="onboarding")
    assert repo.upserts[0][2]["source"] == "onboarding_import"
    assert "onboarding_import" in FIRST_ROLE_SOURCES
