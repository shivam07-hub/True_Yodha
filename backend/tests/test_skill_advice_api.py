from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.diary import get_token_diary_repository
from app.repositories.users import get_token_users_repository
from app.services.llm_provider import get_llm_provider


class _FakeUsersRepository:
    def __init__(self, forged_level_up: bool = True) -> None:
        self._forged_level_up = forged_level_up

    def has_forged_level_up(self, _user_id: str, _taxonomy_key: str) -> bool:
        return self._forged_level_up


class _FakeDiaryRepository:
    def list_daily_logs(self, _user_id: str, _limit: int) -> list[dict[str, Any]]:
        return [
            {"entry_text": "Built an outreach tracker and tested follow-up response timing."},
            {"entry_text": "Reworked CV bullets around stakeholder influence and measurable pipeline."},
        ]


def _override(users_repo: _FakeUsersRepository) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_llm_provider] = lambda: object()
    app.dependency_overrides[get_token_users_repository] = lambda: users_repo
    app.dependency_overrides[get_token_diary_repository] = lambda: _FakeDiaryRepository()


def _clear() -> None:
    app.dependency_overrides.clear()


def test_forged_skill_advice_is_free_and_uses_diary_context() -> None:
    _override(_FakeUsersRepository(forged_level_up=True))

    try:
        with (
            patch("app.routers.users.generate_skill_advice", return_value="Use the forged context.") as advice,
            patch("app.routers.users.assert_can_spend_xp") as preflight,
            patch("app.routers.users.spend_xp") as spend,
            patch("app.routers.users.get_xp_balance", return_value=1000, create=True),
            TestClient(app) as client,
        ):
            response = client.post(
                "/users/me/skills/level-up-advice",
                json={
                    "taxonomy_key": "Strategic Leadership",
                    "current_level": 2,
                    "evidence_text": "Led hiring process improvements.",
                    "free_unlock": True,
                },
            )
    finally:
        _clear()

    assert response.status_code == 200
    assert response.json()["xp_spent"] == 0
    assert response.json()["new_xp_balance"] == 1000
    preflight.assert_not_called()
    spend.assert_not_called()
    evidence_text = advice.call_args.kwargs["evidence_text"]
    assert "Recent diary notes:" in evidence_text
    assert "outreach tracker" in evidence_text


def test_forged_skill_advice_requires_a_forged_level_up() -> None:
    _override(_FakeUsersRepository(forged_level_up=False))

    try:
        with (
            patch("app.routers.users.generate_skill_advice", return_value="Nope."),
            patch("app.routers.users.assert_can_spend_xp"),
            patch("app.routers.users.spend_xp", return_value=980),
            TestClient(app) as client,
        ):
            response = client.post(
                "/users/me/skills/level-up-advice",
                json={
                    "taxonomy_key": "Strategic Leadership",
                    "current_level": 2,
                    "evidence_text": "Led hiring process improvements.",
                    "free_unlock": True,
                },
            )
    finally:
        _clear()

    assert response.status_code == 403
