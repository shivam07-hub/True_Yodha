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
        self.followed_companies: list[dict[str, Any]] = []
        self.followed_writes: list[tuple[str, str]] = []

    def get_profile(self, _user_id: str) -> dict[str, Any] | None:
        return self.profile

    def update_profile(self, user_id: str, updates: dict[str, Any]) -> None:
        self.updates.append((user_id, updates))
        if self.profile:
            self.profile.update(updates)

    def list_user_skill_records(self, _user_id: str) -> list[UserSkillRecord]:
        return self.records

    def has_forged_level_up(self, _user_id: str, _taxonomy_key: str) -> bool:
        return False

    def get_followed_companies(self, _user_id: str) -> list[dict[str, Any]]:
        return self.followed_companies

    def follow_company(self, user_id: str, company_name: str) -> None:
        self.followed_writes.append((user_id, company_name))

    def unfollow_company(self, _user_id: str, _company_name: str) -> None:
        pass


class _FakeDiaryRepository:
    def list_daily_logs(self, _user_id: str, _limit: int) -> list[dict[str, Any]]:
        return []


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


def test_update_profile_grants_linkedin_xp_once_when_linkedin_added(monkeypatch) -> None:
    repo = _FakeUsersRepository(profile=_profile_row(linkedin_url=None, linkedin_xp_granted=False))
    grants: list[str] = []

    async def _grant(user_id: str) -> tuple[int, int]:
        grants.append(user_id)
        return 50, 1050

    monkeypatch.setattr(users, "grant_linkedin_profile_xp", _grant)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.put("/users/me/profile", json={"linkedin_url": "https://linkedin.com/in/ada"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["xp_earned"] == 50
    assert response.json()["new_xp_balance"] == 1050
    assert grants == ["u1"]


def test_update_profile_does_not_grant_linkedin_xp_after_first_reward(monkeypatch) -> None:
    repo = _FakeUsersRepository(
        profile=_profile_row(
            linkedin_url="https://linkedin.com/in/ada",
            linkedin_xp_granted=True,
        )
    )

    async def _grant(_user_id: str) -> tuple[int, int]:  # pragma: no cover
        raise AssertionError("LinkedIn XP should be one-time only")

    monkeypatch.setattr(users, "grant_linkedin_profile_xp", _grant)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.put("/users/me/profile", json={"linkedin_url": "https://linkedin.com/in/grace"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["xp_earned"] == 0
    assert response.json()["new_xp_balance"] is None


def test_get_my_skills_groups_repository_records(monkeypatch) -> None:
    repo = _FakeUsersRepository(
        records=[
            UserSkillRecord("Python", "Python", 2, "Trailblazer", "Built ETL", 0, False),
            UserSkillRecord("SQL", "SQL", 4, "Cartographer", None, 2, True),
        ]
    )

    def fake_lookup(key: str) -> SimpleNamespace:
        if key == "Python":
            return SimpleNamespace(l1_domain="IT", l2_cluster="Programming Languages")
        return SimpleNamespace(l1_domain="IT", l2_cluster="Databases")

    monkeypatch.setattr(users, "lookup_by_name", fake_lookup)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/users/me/skills")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert [item["key"] for item in body["by_domain"]["IT"]] == ["SQL", "Python"]
    assert body["by_cluster"]["Databases"][0]["level"] == 4
    assert body["by_cluster"]["Databases"][0]["forged_level_up_available"] is True


def test_skill_advice_does_not_spend_xp_when_provider_returns_no_advice(monkeypatch) -> None:
    async def _no_advice(**_kwargs: Any) -> None:
        return None

    async def _can_spend(*_args: Any, **_kwargs: Any) -> int:
        return 100

    async def _spend(*_args: Any, **_kwargs: Any) -> int:  # pragma: no cover
        raise AssertionError("XP should not be spent without generated advice")

    monkeypatch.setattr(users, "generate_skill_advice", _no_advice)
    monkeypatch.setattr(users, "assert_can_spend_xp", _can_spend)
    monkeypatch.setattr(users, "spend_xp", _spend)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_llm_provider] = lambda: object()
    app.dependency_overrides[users.get_token_users_repository] = lambda: _FakeUsersRepository()
    app.dependency_overrides[users.get_token_diary_repository] = lambda: _FakeDiaryRepository()

    try:
        with TestClient(app) as client:
            response = client.post(
                "/users/me/skills/level-up-advice",
                json={"taxonomy_key": "SQL", "current_level": 2, "evidence_text": "Built SQL dashboards."},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert "No XP was spent" in response.json()["detail"]


def test_skill_advice_spends_xp_after_advice_is_generated(monkeypatch) -> None:
    calls: list[str] = []

    async def _advice(**_kwargs: Any) -> str:
        calls.append("generated")
        return "Build one proof-backed SQL dashboard."

    async def _can_spend(*_args: Any, **_kwargs: Any) -> int:
        calls.append("preflight")
        return 100

    async def _spend(*_args: Any, **_kwargs: Any) -> int:
        calls.append("spent")
        return 80

    monkeypatch.setattr(users, "generate_skill_advice", _advice)
    monkeypatch.setattr(users, "assert_can_spend_xp", _can_spend)
    monkeypatch.setattr(users, "spend_xp", _spend)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_llm_provider] = lambda: object()
    app.dependency_overrides[users.get_token_users_repository] = lambda: _FakeUsersRepository()
    app.dependency_overrides[users.get_token_diary_repository] = lambda: _FakeDiaryRepository()

    try:
        with TestClient(app) as client:
            response = client.post(
                "/users/me/skills/level-up-advice",
                json={"taxonomy_key": "SQL", "current_level": 2, "evidence_text": "Built SQL dashboards."},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["new_xp_balance"] == 80
    assert calls == ["preflight", "generated", "spent"]


def test_follow_company_case_insensitive_duplicate_does_not_spend_xp(monkeypatch) -> None:
    repo = _FakeUsersRepository()
    repo.followed_companies = [
        {"company_name": "Google", "created_at": datetime.now(timezone.utc)},
    ]

    async def _spend(*_args: Any, **_kwargs: Any) -> int:  # pragma: no cover
        raise AssertionError("Duplicate follows should not spend XP")

    monkeypatch.setattr(users, "spend_xp_to_floor", _spend)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post("/users/me/following/companies", json={"company_name": " google "})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json() == {"company_name": "Google", "new_xp_balance": None}
    assert repo.followed_writes == []
