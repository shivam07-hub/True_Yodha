"""Direction is the last onboarding page — complete only with a claimed ninja."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import onboarding_service


def test_complete_requires_claimed_ninja(monkeypatch: pytest.MonkeyPatch) -> None:
    class _State:
        def get_state(self, _user_id: str) -> dict[str, Any]:
            return {}

    class _CV:
        def latest_baseline(self, _user_id: str) -> dict[str, Any]:
            return {"id": 1, "skills_confirmed_at": "2026-08-15T00:00:00+00:00"}

    class _Users:
        def get_profile(self, _user_id: str) -> dict[str, Any]:
            return {"target_role_title": "PM"}  # no ninja_name_claimed_at

    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _State())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CV())
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Users())

    with pytest.raises(ValueError, match="Claim your Myro name"):
        onboarding_service.complete_onboarding_after_direction(object(), "u1")


def test_complete_marks_when_ninja_claimed(monkeypatch: pytest.MonkeyPatch) -> None:
    done: list[str] = []

    class _State:
        def get_state(self, _user_id: str) -> dict[str, Any]:
            return {}

        def mark_completed(self, user_id: str) -> None:
            done.append(user_id)

    class _CV:
        def latest_baseline(self, _user_id: str) -> dict[str, Any]:
            return {"id": 1, "skills_confirmed_at": "2026-08-15T00:00:00+00:00"}

        def update_cv_profile(self, user_id: str, _payload: dict[str, Any]) -> None:
            done.append(f"cv:{user_id}")

    class _Users:
        def get_profile(self, _user_id: str) -> dict[str, Any]:
            return {
                "target_role_title": "PM",
                "ninja_name_claimed_at": "2026-08-15T00:00:00+00:00",
            }

    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _State())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CV())
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Users())

    onboarding_service.complete_onboarding_after_direction(object(), "u1")
    assert done == ["cv:u1", "u1"]


def test_already_complete_is_a_no_op(monkeypatch: pytest.MonkeyPatch) -> None:
    class _State:
        def get_state(self, _user_id: str) -> dict[str, Any]:
            return {"completed_at": "2026-08-15T00:00:00+00:00"}

    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _State())
    onboarding_service.complete_onboarding_after_direction(object(), "u1")
