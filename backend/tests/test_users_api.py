from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.repositories.users import UserSkillRecord
from app.routers import users


def _profile_row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = {
        "id": "u1",
        "email": "u@example.com",
        "full_name": "Ada Lovelace",
        "linkedin_url": None,
        "target_roles": ["Data Analyst"],
        "target_location": None,
        "cv_url": None,
        "cv_parsed_at": None,
        "onboarding_complete": True,
        "created_at": now,
        "last_active_at": now,
    }
    row.update(overrides)
    return row


class _FakeUsersRepository:
    def __init__(
        self,
        profile: dict[str, Any] | None = None,
        records: list[UserSkillRecord] | None = None,
    ) -> None:
        self.profile = profile
        self.records = records or []
        self.updates: list[tuple[str, dict[str, Any]]] = []

    def get_profile(self, _user_id: str) -> dict[str, Any] | None:
        return self.profile

    def update_profile(self, user_id: str, updates: dict[str, Any]) -> None:
        self.updates.append((user_id, updates))
        if self.profile:
            self.profile.update(updates)

    def list_user_skill_records(self, _user_id: str) -> list[UserSkillRecord]:
        return self.records


def test_get_me_reads_through_token_repository() -> None:
    repo = _FakeUsersRepository(profile=_profile_row())
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["email"] == "u@example.com"


def test_update_profile_writes_through_token_repository() -> None:
    repo = _FakeUsersRepository(profile=_profile_row())
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.put("/users/me/profile", json={"full_name": "Grace Hopper"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["full_name"] == "Grace Hopper"
    assert repo.updates == [("u1", {"full_name": "Grace Hopper"})]


def test_get_my_skills_groups_repository_records(monkeypatch) -> None:
    repo = _FakeUsersRepository(
        records=[
            UserSkillRecord("Python", "Python", 2, "Trailblazer", "Built ETL"),
            UserSkillRecord("SQL", "SQL", 4, "Cartographer", None),
        ]
    )

    def fake_lookup(key: str) -> SimpleNamespace:
        if key == "Python":
            return SimpleNamespace(l1_domain="IT", l2_cluster="Programming Languages")
        return SimpleNamespace(l1_domain="IT", l2_cluster="Databases")

    monkeypatch.setattr(users, "lookup_by_name", fake_lookup)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_admin_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/users/me/skills")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert [item["key"] for item in body["by_domain"]["IT"]] == ["SQL", "Python"]
    assert body["by_cluster"]["Databases"][0]["level"] == 4

