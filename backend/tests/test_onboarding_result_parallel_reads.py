"""`/onboarding/result` facts must not be sequential.

Direction completes onboarding and sends the user to Market, so this endpoint is
no longer polled for a shortlist wait. The step-1 CV-analysis poll still needs
state + profile + baseline together — assert those overlap with a barrier.
"""

from __future__ import annotations

import threading
from typing import Any

import pytest

from app.services import onboarding_service


_BARRIER_TIMEOUT = 5.0


class _Gate:
    """Passes only when `parties` callers are inside it at the same moment."""

    def __init__(self, parties: int) -> None:
        self._barrier = threading.Barrier(parties)

    def arrive(self) -> None:
        try:
            self._barrier.wait(timeout=_BARRIER_TIMEOUT)
        except threading.BrokenBarrierError:
            raise AssertionError(
                "reads did not overlap — they are running one after another"
            )


def test_the_journey_facts_are_read_at_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """state + profile + baseline are independent, and every poll needs all three."""
    gate = _Gate(3)

    class _State:
        def get_state(self, _user_id: str) -> dict[str, Any]:
            gate.arrive()
            return {}

    class _Users:
        def get_profile(self, _user_id: str) -> dict[str, Any]:
            gate.arrive()
            return {}

    class _CV:
        def latest_baseline(self, _user_id: str) -> None:
            gate.arrive()
            return None

    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _State())
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Users())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CV())

    result = onboarding_service._current_result(object(), "u1")

    assert result["kind"] == "full_result_processing"
    assert result["journey_step"] == 1


def test_direction_complete_lands_on_market_without_shortlist_wait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Target + claimed ninja → Market. No score/shortlist poll on this path."""
    baseline = {"id": 7, "skills_confirmed_at": "2026-08-04T00:00:00+00:00"}
    profile = {
        "target_role_title": "Data Analyst",
        "target_seniority": "mid",
        "ninja_name_claimed_at": "2026-08-15T00:00:00+00:00",
    }
    completed: list[str] = []

    class _Onboarding:
        def get_state(self, _user_id: str) -> dict[str, Any]:
            return {}

        def mark_completed(self, user_id: str) -> None:
            completed.append(f"state:{user_id}")

    class _Users:
        def get_profile(self, _user_id: str) -> dict[str, Any]:
            return profile

    class _CV:
        def latest_baseline(self, _user_id: str) -> dict[str, Any]:
            return baseline

        def update_cv_profile(self, user_id: str, _payload: dict[str, Any]) -> None:
            completed.append(f"cv:{user_id}")

    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _Onboarding())
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Users())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CV())

    result = onboarding_service._current_result(object(), "u1")

    assert result["kind"] == "onboarding_complete"
    assert result["redirect_to"] == "/market"
    assert completed == ["cv:u1", "state:u1"]
