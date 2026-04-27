"""Tests for PATCH /users/me/skills/{taxonomy_key}/level — skill level correction."""

from typing import Any

from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.repositories.users import UsersRepository, get_token_users_repository


class _FakeUsersRepository:
    def __init__(
        self,
        skill_id: int | None = 42,
    ) -> None:
        self._skill_id = skill_id
        self.corrected: dict[str, Any] | None = None

    def get_profile(self, _user_id: str) -> dict[str, Any] | None:
        return None

    def update_profile(self, _user_id: str, _updates: dict[str, Any]) -> None:
        pass

    def list_user_skill_records(self, _user_id: str) -> list[Any]:
        return []

    def get_skill_id_by_taxonomy_key(self, _taxonomy_key: str) -> int | None:
        return self._skill_id

    def correct_skill_level(self, user_id: str, skill_id: int, new_level: int) -> None:
        self.corrected = {"user_id": user_id, "skill_id": skill_id, "new_level": new_level}


class _FakeScoresRepository:
    def __init__(self, total_score: float = 72.0) -> None:
        self._total_score = total_score

    @property
    def client(self) -> object:
        return object()

    def get_recompute_inputs(self, _user_id: str) -> Any:
        from app.repositories.scores import ScoreRecomputeInputs
        return ScoreRecomputeInputs(skill_level_map={"python": 3}, target_roles=[])

    def get_user_skill_level_map(self, _user_id: str) -> dict[str, int]:
        return {"python": 3}

    def get_target_roles(self, _user_id: str) -> list[str]:
        return []

    def find_role_skill_rows(self, _role: str) -> list[dict[str, Any]]:
        return []

    def list_market_skill_rows(self) -> list[dict[str, Any]]:
        return []

    def upsert_user_skill_rows(self, _rows: list[dict[str, Any]]) -> None:
        pass

    def mirror_score_exists(self, _user_id: str) -> bool:
        return True

    def update_mirror_score(self, _user_id: str, _payload: dict[str, Any]) -> None:
        pass

    def insert_mirror_score(self, _user_id: str, _payload: dict[str, Any]) -> None:
        pass

    def append_score_history(self, _user_id: str, _total_score: float) -> None:
        pass

    def require_mirror_score(self, _user_id: str) -> dict[str, Any]:
        return {
            "total_score": self._total_score,
            "domain_scores": {},
            "gap_skills": [],
            "skills_assessed": 1,
            "computed_at": "2026-04-27T00:00:00+00:00",
        }


def _override(users_repo: _FakeUsersRepository, scores_repo: _FakeScoresRepository) -> None:
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[get_token_users_repository] = lambda: users_repo
    app.dependency_overrides[get_token_scores_repository] = lambda: scores_repo


def _clear() -> None:
    app.dependency_overrides.clear()


# ── Tracer bullet ──────────────────────────────────────────────────────────────

def test_correct_skill_level_returns_taxonomy_key_and_new_level() -> None:
    users_repo = _FakeUsersRepository(skill_id=42)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/users/me/skills/python/level",
                json={"level": 3},
            )
    finally:
        _clear()

    assert response.status_code == 200
    body = response.json()
    assert body["taxonomy_key"] == "python"
    assert body["new_level"] == 3


# ── Validation ────────────────────────────────────────────────────────────────

def test_level_zero_rejected() -> None:
    users_repo = _FakeUsersRepository()
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            response = client.patch("/users/me/skills/python/level", json={"level": 0})
    finally:
        _clear()

    assert response.status_code == 422


def test_level_six_rejected() -> None:
    users_repo = _FakeUsersRepository()
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            response = client.patch("/users/me/skills/python/level", json={"level": 6})
    finally:
        _clear()

    assert response.status_code == 422


# ── Not found ─────────────────────────────────────────────────────────────────

def test_unknown_taxonomy_key_returns_404() -> None:
    users_repo = _FakeUsersRepository(skill_id=None)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/users/me/skills/no-such-skill/level",
                json={"level": 3},
            )
    finally:
        _clear()

    assert response.status_code == 404


# ── Writes ────────────────────────────────────────────────────────────────────

def test_correct_skill_level_writes_correction_to_repo() -> None:
    users_repo = _FakeUsersRepository(skill_id=7)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            client.patch("/users/me/skills/python/level", json={"level": 4})
    finally:
        _clear()

    assert users_repo.corrected is not None
    assert users_repo.corrected["skill_id"] == 7
    assert users_repo.corrected["new_level"] == 4
