from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.routers import jobs


class _FakeJobsRepository:
    @property
    def client(self) -> object:
        return object()


def test_get_application_path_calls_service(monkeypatch) -> None:
    repo = _FakeJobsRepository()
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    monkeypatch.setattr(
        jobs.job_path_service,
        "get_application_path",
        lambda db, user_id, job_id: {
            "job_id": job_id,
            "job_title": "Data Analyst",
            "company": "Acme",
            "readiness_pct": 68,
            "readiness_tier": {"id": "competitive", "label": "Competitive"},
            "target_skills": [],
            "milestones": [],
            "today_milestone": None,
            "cv": None,
            "follow_up": None,
            "status": "pending",
            "applied_at": None,
        },
    )

    try:
        with TestClient(app) as client:
            response = client.get("/jobs/applications/job-1/path")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["readiness_pct"] == 68


def test_put_targets_replaces_targets_and_returns_path(monkeypatch) -> None:
    repo = _FakeJobsRepository()
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    monkeypatch.setattr(
        jobs.job_path_service,
        "replace_skill_targets",
        lambda db, user_id, job_id, targets: {
            "job_id": job_id,
            "job_title": "Data Analyst",
            "company": "Acme",
            "readiness_pct": 20,
            "readiness_tier": {"id": "cold", "label": "Cold"},
            "target_skills": targets,
            "milestones": [],
            "today_milestone": None,
            "cv": None,
            "follow_up": None,
            "status": "pending",
            "applied_at": None,
        },
    )

    try:
        with TestClient(app) as client:
            response = client.put(
                "/jobs/applications/job-1/targets",
                json={"targets": [{"skill": "SQL", "is_primary": True}]},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["target_skills"][0]["skill"] == "SQL"


def test_generate_job_cv_is_explicit_endpoint(monkeypatch) -> None:
    repo = _FakeJobsRepository()
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    monkeypatch.setattr(
        jobs.job_path_service,
        "generate_job_cv",
        lambda db, user_id, job_id, ai_polish=False: {
            "id": 1,
            "job_id": job_id,
            "cv_text": "Starter CV\n\nBaseline",
            "polished_text": None,
            "confidence": {"id": "starter", "label": "Starter CV"},
            "snapshot_hash": "hash",
            "from_cache": False,
            "ai_polish_used": 0,
            "ai_polish_limit": 3,
            "limit_reached": False,
            "polish_unavailable": False,
        },
    )

    try:
        with TestClient(app) as client:
            response = client.post("/jobs/applications/job-1/cv", json={"ai_polish": False})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["confidence"]["id"] == "starter"
