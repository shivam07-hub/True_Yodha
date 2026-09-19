"""Career Story Reservoir API — ingest / profile / curation / projection."""
import io
import zipfile
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.career_reservoir import get_career_reservoir_repository
from app.repositories.connections import get_token_connections_repository
from app.repositories.cv import get_token_cv_repository
from app.repositories.cv_dump import get_cv_dump_repository
from app.services import career_reservoir

_H = {"Authorization": "Bearer t1"}


class _FakeDumpRepo:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def add(self, user_id: str, text: str, source: str = "manual", *, kind: str = "note", payload=None):
        row = {"id": f"e{len(self.rows) + 1}", "user_id": user_id, "text": text,
               "source": source, "kind": kind, "payload": payload or {}}
        self.rows.append(row)
        return row


class _FakeConnectionsRepo:
    def __init__(self) -> None:
        self.saved: list[dict[str, Any]] = []

    def replace_all(self, user_id: str, rows: list[dict[str, Any]]) -> int:
        self.saved = rows
        return len(rows)


class _FakeReservoirRepo:
    def __init__(self, roles=None, stories=None, pointers=None, pending=0) -> None:
        self.roles = roles or []
        self.stories = stories or []
        self.pointers = pointers or []
        self.pending = pending
        self.patches: list[tuple[str, dict]] = []
        self.declined: list[tuple[str, bool]] = []

    def list_roles(self, user_id):
        return self.roles

    def list_stories(self, user_id, *, include_archived=False):
        return self.stories

    def story_pointers(self, user_id, story_ids):
        return [p for p in self.pointers if str(p.get("story_id")) in set(story_ids)]

    def ingest_status(self, user_id):
        return {
            "pending": self.pending, "processed": 0,
            "awaiting_upgrade": getattr(self, "awaiting_upgrade", set()),
        }

    def set_completion_declined(self, user_id, story_id, declined):
        self.declined.append((story_id, declined))
        for s in self.stories:
            if str(s["id"]) == story_id:
                s["completion_declined_at"] = "2026-09-14T00:00:00Z" if declined else None
                return s
        return None

    def clear_completion_declines(self, user_id):
        n = 0
        for s in self.stories:
            if s.get("completion_declined_at"):
                s["completion_declined_at"] = None
                n += 1
        return n

    # role-dedup (#38) contract
    def merge_proposals(self, user_id):
        return []

    def recent_auto_folds(self, user_id, days=7):
        return 0

    def record_merge_verdict(self, user_id, role_a, role_b, verdict, decided_by):
        return None

    def pending_entries(self, user_id, limit=20):
        return []

    def update_story(self, user_id, story_id, updates):
        self.patches.append((story_id, updates))
        for s in self.stories:
            if str(s["id"]) == story_id:
                s.update(updates)
                return s
        return None

    def story_embeddings(self, user_id):
        return getattr(self, "embeddings", [])


class _FakeJobsRepo:
    def __init__(self, job=None, deepening=None):
        self.job = job
        self.deepening = deepening

    def get_jobs_by_ids(self, ids):
        return [self.job] if self.job else []

    def get_application_job_snapshot(self, user_id, job_id):
        return None

    def get_deepening(self, user_id, job_id, prompt_key):
        return self.deepening


def _override(
    dump: _FakeDumpRepo | None = None,
    reservoir: _FakeReservoirRepo | None = None,
    connections: _FakeConnectionsRepo | None = None,
):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_connections_repository] = lambda: connections or _FakeConnectionsRepo()
    if dump is not None:
        app.dependency_overrides[get_cv_dump_repository] = lambda: dump
    if reservoir is not None:
        app.dependency_overrides[get_career_reservoir_repository] = lambda: reservoir


@pytest.fixture(autouse=True)
def _clean_overrides():
    yield
    app.dependency_overrides.clear()


def test_ingest_text_and_txt_file(monkeypatch):
    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append((uid, eid)))
    dump = _FakeDumpRepo()
    _override(dump=dump)

    long_text = "Led the sponsorship drive for the national fest and raised the full budget target. " * 3
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[("files", ("notes.txt", long_text.encode(), "text/plain"))],
            data={"text": long_text},
            headers=_H,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["entries"]) == 2
    assert body["skipped"] == []
    assert {e[1] for e in enqueued} == {"e1", "e2"}
    assert dump.rows[0]["kind"] == "file"
    assert dump.rows[0]["source"] == "reservoir_dump"


def test_ingest_skips_unsupported_and_short(monkeypatch):
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: None)
    _override(dump=_FakeDumpRepo())
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[
                ("files", ("weird.exe", b"x" * 200, "application/octet-stream")),
                ("files", ("tiny.txt", b"too short", "text/plain")),
            ],
            headers=_H,
        )
    assert resp.status_code == 200
    reasons = {s["filename"]: s["reason"] for s in resp.json()["skipped"]}
    assert reasons["weird.exe"] == "Unsupported file type"
    assert reasons["tiny.txt"] == "No readable text"
    assert resp.json()["entries"] == []


def test_ingest_linkedin_zip(monkeypatch):
    enqueued: list[str] = []
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append(eid))
    dump = _FakeDumpRepo()
    _override(dump=dump)

    buf = io.BytesIO()
    positions = (
        "Company Name,Title,Description,Location,Started On,Finished On\n"
        'Capgemini,Sales Manager,"Generated 50+ inbound T&M requirements within 10 months through '
        'targeted account penetration and value-led capability showcases.",Hyderabad,May 2025,\n'
    )
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("Positions.csv", positions)
        zf.writestr("Unrelated.csv", "A,B\n1,2\n")
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[("files", ("Complete_LinkedInDataExport.zip", buf.getvalue(), "application/zip"))],
            headers=_H,
        )
    assert resp.status_code == 200
    entry = resp.json()["entries"][0]
    assert entry["kind"] == "linkedin"
    assert "ROLE: Sales Manager @ Capgemini" in dump.rows[0]["text"]
    assert enqueued == ["e1"]


_CONNECTIONS_CSV = (
    "Notes:\n"
    '"Some LinkedIn preamble about emails."\n'
    "\n"
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n"
    "Sarvesh,Patkar,https://linkedin.com/in/x,,AkzoNobel,Manager - Strategy,27 May 2026\n"
    "Asha,Rao,https://linkedin.com/in/y,,3M,Data Lead,12 Apr 2026\n"
)


def test_ingest_routes_connections_csv_to_warm_intro_store(monkeypatch):
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: None)
    conns = _FakeConnectionsRepo()
    _override(dump=_FakeDumpRepo(), connections=conns)
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[("files", ("Connections.csv", _CONNECTIONS_CSV.encode(), "text/csv"))],
            headers=_H,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["connections_saved"] == 2
    assert body["entries"] == [] and body["skipped"] == []
    assert conns.saved[0]["full_name"] == "Sarvesh Patkar"


def test_ingest_zip_extracts_connections_and_career_text(monkeypatch):
    enqueued: list[str] = []
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append(eid))
    dump = _FakeDumpRepo()
    conns = _FakeConnectionsRepo()
    _override(dump=dump, connections=conns)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "Positions.csv",
            "Company Name,Title,Description,Location,Started On,Finished On\n"
            "Capgemini,Sales Manager,Grew pipeline fifty percent in two quarters flat.,Hyderabad,May 2025,\n",
        )
        zf.writestr("Connections.csv", _CONNECTIONS_CSV)
        zf.writestr(
            "Shares_622594202.csv",
            "Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility\n"
            '2026-05-09 05:24:05,link,"Shipped the analytics revamp — 30k jobs tracked.",,,PUBLIC\n',
        )
        zf.writestr("Recommendations_Given.csv",
                    "First Name,Last Name,Company,Job Title,Text,Creation Date,Status\n"
                    "Someone,Else,Acme,PM,Great colleague I praised.,2026-01-01,VISIBLE\n")
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[("files", ("Complete_LinkedInDataExport.zip", buf.getvalue(), "application/zip"))],
            headers=_H,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["connections_saved"] == 2
    assert len(body["entries"]) == 1
    text = dump.rows[0]["text"]
    assert "ROLE: Sales Manager @ Capgemini" in text
    assert "POSTS AUTHORED BY THE USER" in text and "analytics revamp" in text
    assert "praised" not in text  # recommendations GIVEN never enter the story corpus


def test_ingest_skips_linkedin_telemetry_csvs(monkeypatch):
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: None)
    _override(dump=_FakeDumpRepo())
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[
                ("files", ("Ads Clicked.csv", b"Ad Title,Clicked At\nx,y\n" * 20, "text/csv")),
                ("files", ("Logins.csv", b"Login Date,IP Address\nx,y\n" * 20, "text/csv")),
                ("files", ("Comments_622594202.csv", b"Date,Link,Message\nx,y,z\n" * 20, "text/csv")),
            ],
            headers=_H,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["entries"] == []
    assert {s["reason"] for s in body["skipped"]} == {"LinkedIn telemetry — no career signal"}


def test_profile_endpoint_grouping():
    reservoir = _FakeReservoirRepo(
        roles=[{"id": "r1", "company": "Capgemini", "title": "Sales Manager", "kind": "work",
                "date_label": "", "location": "", "status": "active", "created_at": "2026-01-01"}],
        stories=[{"id": "s1", "role_id": "r1", "kind": "project", "title": "Pipeline",
                  "narrative": {"result": "50+ reqs"}, "metrics": [], "skills": ["GTM"], "status": "active"}],
        pointers=[{"id": "p1", "story_id": "s1", "text": "Pointer.", "is_canonical": True}],
        pending=1,
    )
    _override(reservoir=reservoir)
    with TestClient(app) as client:
        resp = client.get("/cv/reservoir/profile", headers=_H)
    assert resp.status_code == 200
    body = resp.json()
    assert body["roles"][0]["stories"][0]["pointer"] == "Pointer."
    assert body["pending_inflows"] == 1
    assert body["competencies"] == ["GTM"]


def test_patch_story_archive():
    reservoir = _FakeReservoirRepo(
        stories=[{"id": "s1", "role_id": None, "kind": "project", "title": "T",
                  "narrative": {}, "metrics": [], "skills": [], "status": "active"}],
    )
    _override(reservoir=reservoir)
    with TestClient(app) as client:
        resp = client.patch("/cv/reservoir/stories/s1", json={"status": "archived"}, headers=_H)
        missing = client.patch("/cv/reservoir/stories/nope", json={"status": "archived"}, headers=_H)
        empty = client.patch("/cv/reservoir/stories/s1", json={}, headers=_H)
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"
    assert missing.status_code == 404
    assert empty.status_code == 422


class _FakeCvRepo:
    def __init__(self, baseline, document=None):
        self.baseline = baseline
        self.document = document
        self.created: list[Any] = []
        self.patched: list[Any] = []

    def latest_baseline(self, user_id):
        return self.baseline

    def job_document(self, user_id, job_id):
        return self.document

    def update_job_draft(self, version_id, user_id, **kw):
        self.patched.append({"id": version_id, **kw})
        return {"id": version_id}

    def create(self, user_id, spec):
        self.created.append(spec)
        return {"id": 42}


def test_project_endpoint_writes_deterministic_version(monkeypatch):
    from app.repositories.jobs import get_token_jobs_repository
    from app.routers.cv import career as career_router

    reservoir = _FakeReservoirRepo(
        roles=[{"id": "r1", "company": "Capgemini", "title": "Sales Manager", "kind": "work",
                "date_label": "May 2025 – Present", "status": "active"}],
        stories=[{"id": "s1", "role_id": "r1", "kind": "project", "title": "Pipeline",
                  "narrative": {}, "metrics": [{"value": "50+", "what": "reqs"}],
                  "skills": ["GTM"], "status": "active"}],
        pointers=[{"id": "p1", "story_id": "s1", "text": "Generated 50+ inbound requirements.", "is_canonical": True}],
    )
    reservoir.embeddings = [{"id": "s1", "embedding": [1.0, 0.0]}]
    cv_repo = _FakeCvRepo(baseline={"id": 7, "cv_structured": {"summary": "S", "contact": {"name": "N"}}})
    jobs_repo = _FakeJobsRepo(job={"job_id": "j1", "job_title": "Sales Manager", "company_name": "Huvo",
                                   "job_description": "Own the full sales cycle."})
    _override(reservoir=reservoir)
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo
    app.dependency_overrides[get_token_jobs_repository] = lambda: jobs_repo

    # No cached coverage → route parses; stub the LLM parse + the projection internals
    # (ranking/reword are covered by test_career_projection). The route test proves
    # wiring: parsed requirements flow through and a deterministic version is written.
    async def fake_parse(jd_text, provider):
        assert jd_text == "Own the full sales cycle."
        return ["own the full sales cycle"]
    monkeypatch.setattr(career_router.jd_coverage, "parse_requirements", fake_parse)

    async def fake_project(**kw):
        assert kw["requirements"] == ["own the full sales cycle"]
        assert kw["story_embeddings"] == [{"id": "s1", "embedding": [1.0, 0.0]}]
        return {
            "cv_structured": {"experience": [{"role": "Sales Manager", "company": "Capgemini",
                                              "dates": "May 2025 – Present",
                                              "bullets": ["Generated 50+ inbound requirements."]}]},
            "included_ids": ["s1"], "parked_ids": [],
        }
    monkeypatch.setattr(career_router.career_projection, "project_for_job", fake_project)

    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/project", json={"job_id": "j1"}, headers=_H)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"version_id": 42, "included": 1, "parked": 0}
    spec = cv_repo.created[0]
    assert spec.kind == "deterministic" and spec.job_id == "j1" and spec.parent_version_id == 7
    assert "Generated 50+ inbound requirements." in spec.body_text


def test_project_conflicts_without_stories():
    from app.repositories.jobs import get_token_jobs_repository

    reservoir = _FakeReservoirRepo()
    cv_repo = _FakeCvRepo(baseline={"id": 7, "cv_structured": {"summary": "S"}})
    jobs_repo = _FakeJobsRepo(job={"job_id": "j1", "job_description": "x"})
    _override(reservoir=reservoir)
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo
    app.dependency_overrides[get_token_jobs_repository] = lambda: jobs_repo
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/project", json={"job_id": "j1"}, headers=_H)
    assert resp.status_code == 409


def test_gap_answer_is_written_as_an_inflow_kind(monkeypatch):
    """A banked answer must be `kind='answer'`, not `note`.

    It was `note` from 2026-07-14 to 2026-09-12, and the inflow ledger reads
    `kind IN INFLOW_KINDS` — so `retry_stale_ingests` could not see a failed
    answer and `ingest_status` reported nothing pending. Three of user
    33b66361's answers sat pending for two months behind that one word.
    """
    from app.repositories.career_reservoir import INFLOW_KINDS
    from app.repositories.jobs import get_token_jobs_repository

    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append((uid, eid)))
    dump = _FakeDumpRepo()
    _override(dump=dump)
    app.dependency_overrides[get_token_jobs_repository] = lambda: _FakeCoverageJobsRepo()

    with TestClient(app) as client:
        resp = client.post(
            "/cv/jd-coverage/answer",
            json={
                "requirement": "Manage partner performance",
                "answer": "I ran the partner scorecard for 40 channels and lifted watch time 18%.",
                "job_id": "j1",
            },
            headers=_H,
        )

    assert resp.status_code == 200
    assert dump.rows[0]["kind"] == "answer"
    assert dump.rows[0]["kind"] in INFLOW_KINDS
    assert enqueued == [("u1", "e1")]


class _FakeCoverageJobsRepo:
    def get_deepening(self, user_id, job_id, prompt_key):
        return None

    def upsert_deepening(self, user_id, job_id, prompt_key, payload):
        return None

    def list_coverage_rows(self, user_id, prompt_key):
        return []


# ── the standing completion queue (#13 L3) ────────────────────────────────────

_NO_NUMBER = (
    "Analyzed patient data using SQL, Excel, and Power BI to inform development "
    "of a physiotherapy device, translating findings into actionable insights"
)


def _queue_repo(**over) -> _FakeReservoirRepo:
    """One told-but-numberless story — the exact shape the upload bridge mints."""
    story = {
        "id": "s1", "role_id": "r1", "status": "active", "kind": "project",
        "title": "Patient data analysis", "metrics": [], "skills": [],
        "narrative": {"situation": "s", "task": "t", "action": "a"},
        "created_at": "2026-09-13T00:00:00Z",
    }
    story.update(over)
    return _FakeReservoirRepo(
        roles=[{"id": "r1", "company": "Medtronic", "title": "Analyst", "kind": "work",
                "status": "active", "created_at": "2026-01-01T00:00:00Z"}],
        stories=[story],
        pointers=[{"id": "p1", "story_id": "s1", "text": _NO_NUMBER,
                   "is_canonical": True, "status": "active", "ordering": 0}],
    )


def test_profile_carries_the_completion_queue(monkeypatch):
    monkeypatch.setattr(career_reservoir, "retry_stale_ingests", lambda repo, uid: None)
    monkeypatch.setattr(career_reservoir, "maybe_enqueue_role_dedup", lambda uid, roles: None)
    _override(reservoir=_queue_repo())
    with TestClient(app) as client:
        body = client.get("/cv/reservoir/profile", headers=_H).json()
    assert body["questions_total"] == 1
    assert body["missing_number"] == 1
    q = body["questions"][0]
    assert q["story_id"] == "s1"
    assert q["kinds"] == ["number"]
    assert q["role_label"] == "Analyst · Medtronic"
    assert q["pointer"] == _NO_NUMBER


def test_a_question_being_answered_right_now_is_not_asked_again(monkeypatch):
    """Never asked twice survives a reload, because the ledger says so."""
    monkeypatch.setattr(career_reservoir, "retry_stale_ingests", lambda repo, uid: None)
    monkeypatch.setattr(career_reservoir, "maybe_enqueue_role_dedup", lambda uid, roles: None)
    repo = _queue_repo()
    repo.awaiting_upgrade = {"s1"}
    _override(reservoir=repo)
    with TestClient(app) as client:
        body = client.get("/cv/reservoir/profile", headers=_H).json()
    assert body["questions"] == []
    assert body["questions_total"] == 0


def test_answering_a_bullet_banks_an_inflow_against_that_story(monkeypatch):
    enqueued: list[str] = []
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append(eid))
    dump, repo = _FakeDumpRepo(), _queue_repo()
    _override(dump=dump, reservoir=repo)
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/stories/s1/answer",
            json={"answer": "We covered 4,200 patients across 3 clinics and cut review time by half."},
            headers=_H,
        )
    assert resp.status_code == 200
    assert resp.json()["entry_id"] == "e1"
    assert enqueued == ["e1"]
    row = dump.rows[0]
    assert row["kind"] == "answer"
    assert row["source"] == "story_completion"
    # This is the whole point: the ingest folds it into the SAME story.
    assert row["payload"]["upgrades_story_id"] == "s1"
    assert row["payload"]["via"] == "stories"


def test_a_thin_answer_gets_one_probe_before_it_is_banked():
    dump, repo = _FakeDumpRepo(), _queue_repo()
    _override(dump=dump, reservoir=repo)
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/stories/s1/answer",
            json={"answer": "It was a big project for us."}, headers=_H,
        )
    assert resp.status_code == 200
    assert resp.json()["follow_up"]
    assert resp.json()["entry_id"] is None
    assert dump.rows == []


def test_skipping_the_probe_still_banks_the_answer(monkeypatch):
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: None)
    dump, repo = _FakeDumpRepo(), _queue_repo()
    _override(dump=dump, reservoir=repo)
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/stories/s1/answer",
            json={"answer": "It was a big project for us.", "final": True}, headers=_H,
        )
    assert resp.status_code == 200
    assert resp.json()["entry_id"] == "e1"


def test_an_answer_cannot_be_grafted_onto_a_story_you_do_not_own():
    dump, repo = _FakeDumpRepo(), _queue_repo()
    _override(dump=dump, reservoir=repo)
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/stories/someone-else/answer",
            json={"answer": "We covered 4,200 patients across three clinics."}, headers=_H,
        )
    assert resp.status_code == 404
    assert dump.rows == []


def test_set_aside_takes_a_bullet_out_of_the_queue_and_counts_it(monkeypatch):
    monkeypatch.setattr(career_reservoir, "retry_stale_ingests", lambda repo, uid: None)
    monkeypatch.setattr(career_reservoir, "maybe_enqueue_role_dedup", lambda uid, roles: None)
    repo = _queue_repo()
    _override(reservoir=repo)
    with TestClient(app) as client:
        assert client.post("/cv/reservoir/stories/s1/set-aside", json={}, headers=_H).status_code == 200
        body = client.get("/cv/reservoir/profile", headers=_H).json()
    assert repo.declined == [("s1", True)]
    assert body["questions"] == []
    assert body["questions_set_aside"] == 1


def test_reopen_brings_every_set_aside_bullet_back(monkeypatch):
    monkeypatch.setattr(career_reservoir, "retry_stale_ingests", lambda repo, uid: None)
    monkeypatch.setattr(career_reservoir, "maybe_enqueue_role_dedup", lambda uid, roles: None)
    repo = _queue_repo(completion_declined_at="2026-09-14T00:00:00Z")
    _override(reservoir=repo)
    with TestClient(app) as client:
        assert client.post("/cv/reservoir/questions/reopen", headers=_H).json()["reopened"] == 1
        body = client.get("/cv/reservoir/profile", headers=_H).json()
    assert body["questions_total"] == 1
    assert body["questions_set_aside"] == 0


def test_answering_a_set_aside_bullet_un_sets_it_aside(monkeypatch):
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: None)
    dump = _FakeDumpRepo()
    repo = _queue_repo(completion_declined_at="2026-09-14T00:00:00Z")
    _override(dump=dump, reservoir=repo)
    with TestClient(app) as client:
        client.post(
            "/cv/reservoir/stories/s1/answer",
            json={"answer": "We covered 4,200 patients across 3 clinics and halved review time."},
            headers=_H,
        )
    assert repo.declined == [("s1", False)]
