from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
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
        *,
        has_cv: bool = False,
        latest_upload_job: dict[str, Any] | None = None,
    ) -> None:
        self.profile = profile
        self.records = records or []
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.followed_companies: list[dict[str, Any]] = []
        self.followed_writes: list[tuple[str, str]] = []
        self._has_cv = has_cv
        self._latest_upload_job = latest_upload_job

    def get_profile(self, _user_id: str) -> dict[str, Any] | None:
        return self.profile

    def has_baseline_cv(self, _user_id: str) -> bool:
        return self._has_cv

    def latest_cv_upload_job(self, _user_id: str) -> dict[str, Any] | None:
        return self._latest_upload_job

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
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["email"] == "u@example.com"
    assert response.json()["has_cv"] is False
    assert response.json()["cv_readiness"] == "missing"
    assert response.json()["cv_upload_job_id"] is None
    assert response.json()["cv_upload_error_code"] is None


def test_get_me_reports_has_cv_when_baseline_exists() -> None:
    """Regression: with no baseline cv_versions row the gate stays closed;
    once a baseline exists, has_cv flips True so RequiresCV unlocks Forge/Skills.
    """
    repo = _FakeUsersRepository(profile=_profile_row(), has_cv=True)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["has_cv"] is True
    assert response.json()["cv_readiness"] == "ready"


def test_get_me_reports_processing_when_cv_upload_is_in_flight() -> None:
    repo = _FakeUsersRepository(
        profile=_profile_row(),
        has_cv=False,
        latest_upload_job={"id": "job-123", "status": "processing", "error_code": None},
    )
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["has_cv"] is False
    assert body["cv_readiness"] == "processing"
    assert body["cv_upload_job_id"] == "job-123"
    assert body["cv_upload_error_code"] is None


def test_get_me_reports_failed_when_latest_upload_failed_and_no_baseline() -> None:
    repo = _FakeUsersRepository(
        profile=_profile_row(),
        has_cv=False,
        latest_upload_job={"id": "job-999", "status": "failed", "error_code": "poll_timeout"},
    )
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["has_cv"] is False
    assert body["cv_readiness"] == "failed"
    assert body["cv_upload_job_id"] == "job-999"
    assert body["cv_upload_error_code"] == "poll_timeout"


def test_update_profile_writes_through_token_repository() -> None:
    repo = _FakeUsersRepository(profile=_profile_row())
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
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
    repo = _FakeUsersRepository(profile=_profile_row(linkedin_url=None, linkedin_coins_granted=False))
    grants: list[str] = []

    async def _grant(user_id: str) -> tuple[int, int]:
        grants.append(user_id)
        return 50, 1050

    monkeypatch.setattr(users, "grant_linkedin_profile_xp", _grant)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.put("/users/me/profile", json={"linkedin_url": "https://linkedin.com/in/ada"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["coins_earned"] == 50
    assert response.json()["new_coin_balance"] == 1050
    assert grants == ["u1"]


def test_update_profile_does_not_grant_linkedin_xp_after_first_reward(monkeypatch) -> None:
    repo = _FakeUsersRepository(
        profile=_profile_row(
            linkedin_url="https://linkedin.com/in/ada",
            linkedin_coins_granted=True,
        )
    )

    async def _grant(_user_id: str) -> tuple[int, int]:  # pragma: no cover
        raise AssertionError("LinkedIn XP should be one-time only")

    monkeypatch.setattr(users, "grant_linkedin_profile_xp", _grant)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.put("/users/me/profile", json={"linkedin_url": "https://linkedin.com/in/grace"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["coins_earned"] == 0
    assert response.json()["new_coin_balance"] is None


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
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
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


def test_follow_company_case_insensitive_duplicate_is_a_noop() -> None:
    repo = _FakeUsersRepository()
    repo.followed_companies = [
        {"company_name": "Google", "created_at": datetime.now(timezone.utc)},
    ]

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post("/users/me/following/companies", json={"company_name": " google "})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json() == {"company_name": "Google"}
    assert repo.followed_writes == []


def test_follow_company_is_free() -> None:
    # Following spends no coins (2026-07-19): a fresh follow writes the row and
    # carries no wallet field at all — this can never move the balance.
    repo = _FakeUsersRepository()

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post("/users/me/following/companies", json={"company_name": "Acme"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json() == {"company_name": "Acme"}
    assert repo.followed_writes == [("u1", "Acme")]


def test_follow_company_blocks_at_slot_cap() -> None:
    repo = _FakeUsersRepository()
    repo.followed_companies = [
        {"company_name": f"Co{i}", "created_at": datetime.now(timezone.utc)}
        for i in range(users.FOLLOWED_COMPANY_LIMIT)
    ]

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[users.get_token_users_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post("/users/me/following/companies", json={"company_name": "OneMore"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "Slot limit reached" in response.json()["detail"]
    assert repo.followed_writes == []
