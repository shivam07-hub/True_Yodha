from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import onboarding_service, skill_confirmation


class _CVRepo:
    def __init__(self, baseline: dict[str, Any], calls: list[str]) -> None:
        self.baseline = baseline
        self.calls = calls

    def find(self, _baseline_id: int, _user_id: str) -> dict[str, Any]:
        return self.baseline

    def latest_baseline(self, _user_id: str) -> dict[str, Any]:
        return self.baseline

    def confirm_skills(self, *_args: Any) -> str:
        self.calls.append("confirm")
        return "2026-07-20T00:00:00+00:00"


class _ScoresRepo:
    def get_user_skill_level_map(self, _user_id: str) -> dict[str, int]:
        raise AssertionError("pending baseline must not reach scoring")


class _OnboardingRepo:
    def __init__(self, calls: list[str]) -> None:
        self.calls = calls

    def patch_state(self, _user_id: str, _payload: dict[str, Any]) -> None:
        self.calls.append("state")


def test_confirmation_publishes_reviewed_skills_before_scoring(monkeypatch) -> None:
    calls: list[str] = []
    baseline = {
        "id": 17,
        "kind": "baseline_upload",
        "skills_detected": [
            {
                "taxonomy_key": "Python (Programming Language)",
                "signal_type": "project",
                "evidence": "Built a Python service",
            }
        ],
    }
    cv_repo = _CVRepo(baseline, calls)
    monkeypatch.setattr(skill_confirmation, "CVVersionsRepository", lambda _db: cv_repo)
    monkeypatch.setattr(skill_confirmation, "ScoresRepository", lambda _db: object())
    monkeypatch.setattr(
        skill_confirmation.scoring,
        "build_cv_skill_rows",
        lambda *_args: [
            {
                "skill_id": 9,
                "matched_level": 2,
                "proficiency_title": "Trailblazer",
                "evidence_text": "Built a Python service",
            }
        ],
    )

    def recompute(*_args: Any) -> dict[str, float]:
        calls.append("score")
        return {"total_score": 62.0}

    monkeypatch.setattr(skill_confirmation.scoring, "recompute_score", recompute)
    monkeypatch.setattr(
        skill_confirmation,
        "UsersRepository",
        lambda _db: type("Users", (), {"get_profile": lambda _self, _uid: {}})(),
    )
    monkeypatch.setattr(
        skill_confirmation,
        "OnboardingRepository",
        lambda _db: _OnboardingRepo(calls),
    )
    monkeypatch.setattr(
        skill_confirmation.background,
        "enqueue",
        lambda *_args, **_kwargs: pytest.fail("no target means no match enqueue"),
    )

    result = skill_confirmation.confirm_baseline_skills(object(), "u1", 17, [])

    assert result["total_score"] == 62.0
    assert calls[:2] == ["confirm", "score"]


def test_target_refresh_stops_before_score_and_match_when_skills_pending(monkeypatch) -> None:
    calls: list[str] = []
    baseline = {"id": 17, "kind": "baseline_upload", "skills_confirmed_at": None}
    monkeypatch.setattr(onboarding_service, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        onboarding_service,
        "CVVersionsRepository",
        lambda _db: _CVRepo(baseline, calls),
    )
    monkeypatch.setattr(
        onboarding_service,
        "ScoresRepository",
        lambda _db: _ScoresRepo(),
    )
    monkeypatch.setattr(
        onboarding_service,
        "OnboardingRepository",
        lambda _db: _OnboardingRepo(calls),
    )
    monkeypatch.setattr(
        onboarding_service.background,
        "enqueue",
        lambda *_args, **_kwargs: pytest.fail("pending skills must not enqueue matching"),
    )

    asyncio.run(
        onboarding_service.refresh_target_result({"user_id": "u1"}, allow_retry=False)
    )

    assert calls == ["state"]
