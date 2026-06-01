from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository


class _FakeJobsRepo:
    def __init__(self) -> None:
        self.dismissed: list[tuple[str, str]] = []

    def dismiss_dashboard_job_card(self, user_id: str, job_id: str) -> None:
        self.dismissed.append((user_id, job_id))


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
