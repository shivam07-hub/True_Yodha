from fastapi.testclient import TestClient

from app.main import app
from app.repositories.company_intelligence import (
    get_company_intelligence_repository,
)


class FakeRepository:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def get(self, company_name: str, *, limit: int):
        self.calls.append((company_name, limit))
        return self.result


def test_company_skill_intelligence_returns_durable_profile() -> None:
    repo = FakeRepository(
        {
            "company_id": 1,
            "company_name": "Acme",
            "slug": "acme",
            "as_of": "2026-07-11T10:00:00+00:00",
            "source_run_id": "00000000-0000-0000-0000-000000000002",
            "skills": [
                {
                    "skill_id": 1,
                    "display_name": "Python",
                    "taxonomy_key": "python",
                    "domain": "Technology",
                    "current_job_count": 12,
                    "peak_job_count": 18,
                    "observation_run_count": 4,
                    "avg_required_level": 3.2,
                    "trend_signal": "emerging",
                    "first_seen_at": "2026-06-01T00:00:00+00:00",
                    "last_seen_at": "2026-07-11T10:00:00+00:00",
                }
            ],
            "newsletter_summary": {
                "top_skills": ["Python"],
                "emerging_skills": ["Python"],
                "declining_skills": [],
                "dormant_skills": [],
            },
        }
    )
    app.dependency_overrides[get_company_intelligence_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/companies/Acme/skill-intelligence?limit=10")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["skills"][0]["trend_signal"] == "emerging"
    assert response.json()["newsletter_summary"]["top_skills"] == ["Python"]
    assert repo.calls == [("Acme", 10)]


def test_company_skill_intelligence_returns_404_for_unknown_company() -> None:
    repo = FakeRepository(None)
    app.dependency_overrides[get_company_intelligence_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/companies/Unknown/skill-intelligence")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
