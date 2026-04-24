from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers import jobs


def test_import_preview_requires_description() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
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
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    monkeypatch.setattr(jobs, "get_supabase_admin", lambda: object())
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
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    monkeypatch.setattr(jobs, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        jobs.job_importer,
        "save_imported_job",
        lambda db, user_id, body: {
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
        },
    )

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
