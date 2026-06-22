from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository


class _FakeJobsRepo:
    def __init__(self, *, stack: list[dict] | None = None, new_jobs: int = 0) -> None:
        self.dismissed: list[tuple[str, str]] = []
        self._stack = stack or []
        self._new_jobs = new_jobs
        self.count_markers: list[int] = []

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
