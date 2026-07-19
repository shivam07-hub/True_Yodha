from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.repositories.jobs import get_token_jobs_repository
from app.repositories.notifications import get_notifications_repository


class _FakeJobsRepository:
    def __init__(self) -> None:
        self.dismissed_saved_jobs: list[tuple[str, str]] = []
        self.restored_saved_jobs: list[tuple[str, str]] = []
        self.dismiss_result = True
        self.restore_result = True
        self.apply_intents: list[tuple[str, str, dict[str, str]]] = []
        self.applications_rows: list[dict[str, Any]] = []
        self.skill_keys: set[str] = set()

    def dismiss_saved_job(self, user_id: str, job_id: str) -> bool:
        self.dismissed_saved_jobs.append((user_id, job_id))
        return self.dismiss_result

    def restore_saved_job(self, user_id: str, job_id: str) -> bool:
        self.restored_saved_jobs.append((user_id, job_id))
        return self.restore_result

    def record_apply_intent(
        self,
        user_id: str,
        job_id: str,
        intent: dict[str, str],
    ) -> None:
        self.apply_intents.append((user_id, job_id, intent))

    def get_user_applications(self, user_id: str) -> list[dict[str, Any]]:
        assert user_id == "user-123"
        return self.applications_rows

    def user_skill_keys(self, user_id: str) -> set[str]:
        assert user_id == "user-123"
        return self.skill_keys


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


class _FakeNotificationsRepository:
    def resolve_collection_attention(self, _user_id: str, _job_id: str) -> None:
        return None


def test_remove_saved_job_records_not_interested_without_deleting_match() -> None:
    repo = _FakeJobsRepository()

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-123", email=None, token="token-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_notifications_repository] = _FakeNotificationsRepository

    try:
        with TestClient(app) as client:
            response = client.delete("/jobs/tracker/job-456")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert repo.dismissed_saved_jobs == [("user-123", "job-456")]


def test_submitted_application_cannot_be_removed_from_collections() -> None:
    repo = _FakeJobsRepository()
    repo.dismiss_result = False

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-123", email=None, token="token-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.delete("/jobs/tracker/job-456")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Only saved jobs can be removed from Collections."
    }


def test_undo_restores_saved_job_and_clears_not_interested() -> None:
    repo = _FakeJobsRepository()

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-123", email=None, token="token-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post("/jobs/tracker/job-456/restore")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert repo.restored_saved_jobs == [("user-123", "job-456")]


def test_apply_click_records_an_attempt_without_marking_application_applied() -> None:
    repo = _FakeJobsRepository()

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-123", email=None, token="token-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/job-456/apply-intents",
                json={
                    "client_event_id": "123e4567-e89b-12d3-a456-426614174000",
                    "surface": "market",
                    "destination_type": "direct_role",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert repo.apply_intents == [
        (
            "user-123",
            "job-456",
            {
                "client_event_id": "123e4567-e89b-12d3-a456-426614174000",
                "surface": "market",
                "destination_type": "direct_role",
            },
        )
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

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-123", email=None, token="token-123")
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


def test_get_applications_enriches_card_with_skill_split_and_location() -> None:
    """An extension-added job renders the full FeedCard: its skills split into
    ✓matched / ✗missing against the CV, plus location/meta pass-through."""
    repo = _FakeJobsRepository()
    repo.skill_keys = {"python (programming language)", "sql"}
    row = _make_application_row(app_id=7, job_id="ext-1", company="Google")
    row["jobs"].update({
        "main_skills": ["Python (Programming Language)", "SQL", "Kubernetes"],
        "location": "Bengaluru",
        "location_mode": "hybrid",
        "seniority_level": "Senior",
    })
    repo.applications_rows = [row]

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-123", email=None, token="token-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_token_cv_repository] = lambda: _FakeCVRepository(latest={})

    try:
        with TestClient(app) as client:
            response = client.get("/jobs/applications")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    card = response.json()[0]
    assert card["matched_skills"] == ["Python (Programming Language)", "SQL"]
    assert card["missing_skills"] == ["Kubernetes"]
    assert card["skills"] == ["Python (Programming Language)", "SQL", "Kubernetes"]
    assert card["location"] == "Bengaluru"
    assert card["location_mode"] == "hybrid"
    assert card["seniority_level"] == "Senior"


def test_get_applications_returns_empty_badges_when_no_thread_data() -> None:
    repo = _FakeJobsRepository()
    repo.applications_rows = [
        _make_application_row(app_id=10, job_id="acme-pm-1", company="Acme"),
    ]
    cv_repo = _FakeCVRepository(latest={})

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-123", email=None, token="token-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo

    try:
        with TestClient(app) as client:
            response = client.get("/jobs/applications")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["cv_badge"] is None
