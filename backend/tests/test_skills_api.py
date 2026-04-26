from fastapi.testclient import TestClient

from app.main import app
from app.repositories.skills import SkillRecord
from app.routers import skills


class _FakeSkillsRepository:
    def list_active_skills(self) -> list[SkillRecord]:
        return [
            SkillRecord(
                id=1,
                taxonomy_key="Python",
                display_name="Python",
                lightcast_id=None,
                l1_domain="IT",
                l2_cluster="Programming Languages",
            )
        ]

    def list_active_domains(self) -> list[str]:
        return ["Business", "IT"]


def test_list_skills_reads_through_skills_repository() -> None:
    app.dependency_overrides[skills.get_skills_repository] = _FakeSkillsRepository

    try:
        with TestClient(app) as client:
            response = client.get("/skills")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "skills": [
            {
                "id": 1,
                "taxonomy_key": "Python",
                "display_name": "Python",
                "lightcast_id": None,
                "l1_domain": "IT",
                "l2_cluster": "Programming Languages",
            }
        ],
        "total": 1,
    }


def test_list_domains_reads_through_skills_repository() -> None:
    app.dependency_overrides[skills.get_skills_repository] = _FakeSkillsRepository

    try:
        with TestClient(app) as client:
            response = client.get("/skills/domains")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == ["Business", "IT"]

