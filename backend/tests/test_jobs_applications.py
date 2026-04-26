from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.repositories.jobs import get_token_jobs_repository


class _FakeJobsRepository:
    def __init__(self) -> None:
        self.deleted: list[tuple[str, str, str]] = []

    def delete_tracker_rows(self, user_id: str, job_id: str) -> None:
        self.deleted.append(("job_applications", user_id, job_id))
        self.deleted.append(("user_job_matches", user_id, job_id))


def test_remove_tracker_job_deletes_current_users_application_and_match() -> None:
    repo = _FakeJobsRepository()

    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "user-123",
        "token": "token-123",
    }
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.delete("/jobs/tracker/job-456")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert repo.deleted == [
        ("job_applications", "user-123", "job-456"),
        ("user_job_matches", "user-123", "job-456"),
    ]
