from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository


class _FakeJobsRepo:
    def __init__(
        self,
        *,
        stack: list[dict] | None = None,
        new_jobs: int = 0,
        agent_picks: list[dict] | None = None,
    ) -> None:
        self.dismissed: list[tuple[str, str]] = []
        self._stack = stack or []
        self._new_jobs = new_jobs
        self._agent_picks = agent_picks or []
        self.count_markers: list[int] = []
        self.exposures: list[tuple[str, str, list[str]]] = []

    def get_agent_picks(self, user_id: str) -> list[dict]:
        return self._agent_picks

    def dismiss_dashboard_job_card(self, user_id: str, job_id: str) -> None:
        self.dismissed.append((user_id, job_id))

    def get_user_match_stack(self, user_id: str) -> list[dict]:
        return self._stack

    def get_feed_updated_at(self) -> str | None:
        return None

    def get_dismissed_job_card_ids(self, user_id: str) -> list[str]:
        return []

    def count_new_jobs_since(self, since) -> int:
        self.count_markers.append(since)
        return self._new_jobs

    def last_match_run_at(self, _user_id: str):
        from datetime import datetime

        raw = self._stack[0].get("computed_at") if self._stack else None
        return datetime.fromisoformat(str(raw)) if raw else None

    def count_new_jobs_for_user(self, user_id: str) -> int:
        computed_at = self.last_match_run_at(user_id)
        if computed_at is None:
            return 0
        return self.count_new_jobs_since(computed_at)

    def record_recommendation_exposures(
        self, user_id: str, rows: list[dict], *, surface: str
    ) -> int:
        self.exposures.append(
            (user_id, surface, [str(row["job_id"]) for row in rows])
        )
        return len(rows)

    # compute_match_health lookups — empty defaults keep the health path at
    # "empty" (no skills → no failure) for these router tests.
    def has_computed_matches(self, user_id: str) -> bool:
        return False

    def get_user_skill_rows(self, user_id: str) -> list[dict]:
        return []


def test_matches_new_jobs_count_skipped_when_never_matched() -> None:
    # No persisted matches → no baseline → "new since last match" is meaningless,
    # so the count is 0 and the (potentially expensive) count query never runs.
    repo = _FakeJobsRepo(stack=[], new_jobs=99)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/matches")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["new_jobs_count"] == 0
    assert repo.count_markers == []


def test_matches_new_jobs_count_uses_landing_timestamp() -> None:
    """The count is "landed after MY last match", to the second. It used to round
    the user's match time down to a YYYYMMDD int and compare against the scraper's
    own date marker — which made a batch imported the day after its scrape run
    permanently invisible to everyone who had matched since."""
    repo = _FakeJobsRepo(
        stack=[{"id": 1, "job_id": "j1", "computed_at": "2026-06-04T09:00:00+00:00"}],
        new_jobs=7,
    )
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/matches")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["new_jobs_count"] == 7
    # The exact compute instant, not a date bucket.
    assert [dt.isoformat() for dt in repo.count_markers] == ["2026-06-04T09:00:00+00:00"]
    assert repo.exposures == [("u1", "dashboard", ["j1"])]


def test_retry_accepted_when_overlap_only(monkeypatch) -> None:
    # Matches exist but none vetted → free re-vet is allowed and enqueues work.
    repo = _FakeJobsRepo(stack=[{"job_id": "j1", "overall_score": None}])
    enqueued: list = []
    from app.services import background
    monkeypatch.setattr(background, "enqueue", lambda *a, **k: enqueued.append((a, k)))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/matches/retry")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body == {"accepted": True, "match_health": "overlap_only"}
    assert len(enqueued) == 1


def test_retry_refused_when_vetted(monkeypatch) -> None:
    # A vetted user can't use the free re-vet to dodge the paid refresh.
    repo = _FakeJobsRepo(stack=[{"job_id": "j1", "overall_score": 4.5}])
    enqueued: list = []
    from app.services import background
    monkeypatch.setattr(background, "enqueue", lambda *a, **k: enqueued.append((a, k)))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/matches/retry")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"accepted": False, "match_health": "vetted"}
    assert enqueued == []


def test_agent_picks_empty_when_no_picks() -> None:
    # No curated picks → empty band → the frontend never renders it.
    repo = _FakeJobsRepo(agent_picks=[])
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/agent-picks")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["picks"] == []


def test_agent_picks_returns_curated_shortlist_with_comment() -> None:
    picks = [
        {
            "job_id": "j1",
            "job_title": "Growth Management - Manager",
            "company_name": "Paytm",
            "job_description": None,
            "skills": ["Revenue Growth"],
            "matched_skills": ["Revenue Growth"],
            "matched_skill_count": 1,
            "target_role_match": 0,
            "is_active": True,
            "agent_rank": 1,
            "agent_tier": "bullseye",
            "agent_comment": "A direct mirror of your growth work.",
        }
    ]
    repo = _FakeJobsRepo(agent_picks=picks)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/agent-picks")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    pick = body["picks"][0]
    assert pick["job_id"] == "j1"
    assert pick["agent_rank"] == 1
    assert pick["agent_tier"] == "bullseye"
    assert pick["agent_comment"] == "A direct mirror of your growth work."
    assert repo.exposures == [("u1", "agent_pick", ["j1"])]


def test_dismiss_match_card_marks_card_removed_for_current_user() -> None:
    repo = _FakeJobsRepo()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.delete("/jobs/matches/job-456")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert repo.dismissed == [("user-123", "job-456")]
