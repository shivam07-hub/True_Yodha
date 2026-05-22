"""Tests for PATCH /users/me/skills/{taxonomy_key}/level — skill level appeal."""

from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.repositories.users import UsersRepository, UserSkillRecord, get_token_users_repository
from app.services.llm_provider import LLMProvider, get_llm_provider


class _FakeUsersRepository:
    def __init__(
        self,
        skill_id: int | None = 42,
        correction_count: int = 0,
        display_name: str = "Python",
    ) -> None:
        self._skill_id = skill_id
        self._correction_count = correction_count
        self._display_name = display_name
        self.corrected: dict[str, Any] | None = None

    def get_profile(self, _user_id: str) -> dict[str, Any] | None:
        return None

    def update_profile(self, _user_id: str, _updates: dict[str, Any]) -> None:
        pass

    def list_user_skill_records(self, _user_id: str) -> list[UserSkillRecord]:
        if self._skill_id is None:
            return []
        return [
            UserSkillRecord(
                key="python",
                display_name=self._display_name,
                level=2,
                proficiency_title="Trailblazer",
                evidence_text="built Python scripts",
                forge_sessions_count=0,
                forged_level_up_available=False,
                correction_count=self._correction_count,
            )
        ]

    def get_skill_id_by_taxonomy_key(self, _taxonomy_key: str) -> int | None:
        return self._skill_id

    def get_correction_count(self, _user_id: str, _skill_id: int) -> int:
        return self._correction_count

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


class _ApprovingLLMProvider(LLMProvider):
    """LLM stub that always approves the appeal."""

    def __init__(self) -> None:
        super().__init__(providers=[])

    async def complete(self, messages: list[dict], max_tokens: int = 500) -> str | None:
        return '{"approved": true, "verdict": "Strong real-world evidence.", "criteria": "L3 requires measurable impact."}'


class _RejectingLLMProvider(LLMProvider):
    """LLM stub that always rejects the appeal."""

    def __init__(self) -> None:
        super().__init__(providers=[])

    async def complete(self, messages: list[dict], max_tokens: int = 500) -> str | None:
        return '{"approved": false, "verdict": "Evidence too vague.", "criteria": "L3 requires measurable impact."}'


def _override(
    users_repo: _FakeUsersRepository,
    scores_repo: _FakeScoresRepository,
    llm_provider: LLMProvider | None = None,
) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_users_repository] = lambda: users_repo
    app.dependency_overrides[get_token_scores_repository] = lambda: scores_repo
    if llm_provider is not None:
        app.dependency_overrides[get_llm_provider] = lambda: llm_provider


def _clear() -> None:
    app.dependency_overrides.clear()


_BULLET = "Led Python automation for 12-team org, cutting report time by 40%."


# ── Happy path — approved ──────────────────────────────────────────────────────

def test_correct_skill_level_returns_taxonomy_key_and_new_level() -> None:
    users_repo = _FakeUsersRepository(skill_id=42)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo, _ApprovingLLMProvider())

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/users/me/skills/python/level",
                json={"level": 3, "bullet_text": _BULLET},
            )
    finally:
        _clear()

    assert response.status_code == 200
    body = response.json()
    assert body["taxonomy_key"] == "python"
    assert body["new_level"] == 3
    assert body["approved"] is True


# ── Happy path — rejected ─────────────────────────────────────────────────────

def test_rejected_appeal_returns_no_new_level() -> None:
    users_repo = _FakeUsersRepository(skill_id=42)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo, _RejectingLLMProvider())

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/users/me/skills/python/level",
                json={"level": 3, "bullet_text": "vague claim"},
            )
    finally:
        _clear()

    assert response.status_code == 200
    body = response.json()
    assert body["approved"] is False
    assert body["new_level"] is None
    assert body["appeals_remaining"] == 2  # rejected appeals don't consume the cap


# ── Appeal cap ────────────────────────────────────────────────────────────────

def test_appeal_locked_after_two_corrections() -> None:
    users_repo = _FakeUsersRepository(skill_id=42, correction_count=2)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/users/me/skills/python/level",
                json={"level": 3, "bullet_text": _BULLET},
            )
    finally:
        _clear()

    assert response.status_code == 422
    assert "already changed twice" in response.json()["detail"]


# ── Validation ────────────────────────────────────────────────────────────────

def test_level_zero_rejected() -> None:
    users_repo = _FakeUsersRepository()
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            response = client.patch("/users/me/skills/python/level", json={"level": 0, "bullet_text": _BULLET})
    finally:
        _clear()

    assert response.status_code == 422


def test_level_six_rejected() -> None:
    users_repo = _FakeUsersRepository()
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo)

    try:
        with TestClient(app) as client:
            response = client.patch("/users/me/skills/python/level", json={"level": 6, "bullet_text": _BULLET})
    finally:
        _clear()

    assert response.status_code == 422


# ── Not found ─────────────────────────────────────────────────────────────────

def test_unknown_taxonomy_key_returns_404() -> None:
    users_repo = _FakeUsersRepository(skill_id=None)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo, _ApprovingLLMProvider())

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/users/me/skills/no-such-skill/level",
                json={"level": 3, "bullet_text": _BULLET},
            )
    finally:
        _clear()

    assert response.status_code == 404


# ── Writes ────────────────────────────────────────────────────────────────────

def test_correct_skill_level_writes_correction_to_repo() -> None:
    users_repo = _FakeUsersRepository(skill_id=7)
    scores_repo = _FakeScoresRepository()
    _override(users_repo, scores_repo, _ApprovingLLMProvider())

    try:
        with TestClient(app) as client:
            client.patch("/users/me/skills/python/level", json={"level": 4, "bullet_text": _BULLET})
    finally:
        _clear()

    assert users_repo.corrected is not None
    assert users_repo.corrected["skill_id"] == 7
    assert users_repo.corrected["new_level"] == 4
