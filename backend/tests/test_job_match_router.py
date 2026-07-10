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

    def count_new_jobs_since(self, marker: int) -> int:
        self.count_markers.append(marker)
        return self._new_jobs

    def record_recommendation_exposures(
        self, user_id: str, rows: list[dict], *, surface: str
    ) -> int:
        self.exposures.append(
            (user_id, surface, [str(row["job_id"]) for row in rows])
        )
        return len(rows)


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


def test_matches_new_jobs_count_uses_first_seen_marker() -> None:
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
    # Match date 2026-06-04 → YYYYMMDD int marker; count is "strictly after".
    assert repo.count_markers == [20260604]
    assert repo.exposures == [("u1", "dashboard", ["j1"])]


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
