from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.routers import jobs


class _FakeJobsRepository:
    @property
    def client(self) -> object:
        return object()

    def get_user_skill_map(self, user_id: str) -> dict[str, int]:
        # #34 S5 — the preview handler reads this to compute the scored-hook fit.
        return {}


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


def test_import_job_calls_service_and_returns_application(monkeypatch) -> None:
    repo = _FakeJobsRepository()
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
