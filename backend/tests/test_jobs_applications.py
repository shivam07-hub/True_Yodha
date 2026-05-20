from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.repositories.jobs import get_token_jobs_repository


class _FakeJobsRepository:
    def __init__(self) -> None:
        self.deleted: list[tuple[str, str, str]] = []
        self.applications_rows: list[dict[str, Any]] = []

    def delete_tracker_rows(self, user_id: str, job_id: str) -> None:
        self.deleted.append(("job_applications", user_id, job_id))
        self.deleted.append(("user_job_matches", user_id, job_id))

    def get_user_applications(self, user_id: str) -> list[dict[str, Any]]:
        assert user_id == "user-123"
        return self.applications_rows


class _FakeCVRepository:
    def __init__(self, latest: dict[str, dict[str, Any]] | None = None) -> None:
        self._latest = latest or {}
        self.batch_calls: list[list[str]] = []

    def latest_for_thread_batch(
        self, user_id: str, company_names: list[str]
    ) -> dict[str, dict[str, Any]]:
        assert user_id == "user-123"
        self.batch_calls.append(list(company_names))
        return self._latest


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


def _make_application_row(
    *, app_id: int, job_id: str, company: str, status: str = "saved",
) -> dict[str, Any]:
    return {
        "id": app_id,
        "job_id": job_id,
        "status": status,
        "source": "user_discovery",
        "applied_at": None,
        "response_at": None,
        "checkin_sent_at": None,
        "followed_up_at": None,
        "closed_at": None,
        "offer_received_at": None,
        "notes": None,
        "created_at": datetime(2026, 5, 1, tzinfo=timezone.utc).isoformat(),
        "last_stage_changed_at": None,
        "jobs": {"job_title": "Senior PM", "company_name": company, "job_description": ""},
    }


def test_get_applications_attaches_cv_badge_for_companies_with_thread() -> None:
    """CV3/CV4 — tracker list carries cv_badge per row from the Company CV Thread."""
    repo = _FakeJobsRepository()
    repo.applications_rows = [
        _make_application_row(app_id=1, job_id="cap-pm-1", company="Capgemini"),
        _make_application_row(app_id=2, job_id="cap-pm-2", company="Capgemini"),
        _make_application_row(app_id=3, job_id="ms-pm-1",  company="Microsoft"),
    ]
    cv_repo = _FakeCVRepository(
        latest={
            "Capgemini": {
                "id": 41,
                "user_version_number": 7,
                "kind": "polished",
            },
        },
    )

    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "user-123",
        "token": "token-123",
    }
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo

    try:
        with TestClient(app) as client:
            response = client.get("/jobs/applications")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3

    # Same Capgemini badge across both Capgemini rows — Company CV Thread invariant.
    cap_badges = [row["cv_badge"] for row in body if row["job_id"].startswith("cap-")]
    assert cap_badges == [
        {"version_id": 41, "version_number": 7, "kind": "polished", "polished": True},
        {"version_id": 41, "version_number": 7, "kind": "polished", "polished": True},
    ]
    # Microsoft has no thread → null badge.
    ms_row = next(row for row in body if row["job_id"] == "ms-pm-1")
    assert ms_row["cv_badge"] is None
    # One batched lookup with both distinct companies (order-insensitive).
    assert len(cv_repo.batch_calls) == 1
    assert sorted(cv_repo.batch_calls[0]) == ["Capgemini", "Capgemini", "Microsoft"]


def test_get_applications_returns_empty_badges_when_no_thread_data() -> None:
    repo = _FakeJobsRepository()
    repo.applications_rows = [
        _make_application_row(app_id=10, job_id="acme-pm-1", company="Acme"),
    ]
    cv_repo = _FakeCVRepository(latest={})

    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "user-123",
        "token": "token-123",
    }
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo

    try:
        with TestClient(app) as client:
            response = client.get("/jobs/applications")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["cv_badge"] is None
