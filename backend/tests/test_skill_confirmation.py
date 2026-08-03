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


class _UsersRepo:
    def __init__(self, calls: list[str], profile: dict[str, Any] | None = None) -> None:
        self.calls = calls
        self.profile = profile or {}
        self.updates: list[dict[str, Any]] = []

    def get_profile(self, _user_id: str) -> dict[str, Any]:
        return self.profile

    def update_profile(self, _user_id: str, updates: dict[str, Any]) -> None:
        self.calls.append("seniority")
        self.updates.append(updates)


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
        lambda _db: _UsersRepo(calls),
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

    # The score is computed HERE, with no direction chosen — it depends on the
    # confirmed skills and the band, not on the role family. Deferring it to the
    # direction step is what made the user watch "Calculating your Myro Score" on
    # step 3 instead of arriving to a finished number.
    assert result == {"next": "target", "total_score": 62.0}
    # No `cv_structured` on this baseline → the CV says nothing about seniority, so
    # nothing is written. Unknown stays unknown; the direction step asks.
    assert calls == ["confirm", "state", "score"]
    # Publication still strictly precedes scoring.
    assert calls.index("confirm") < calls.index("score")


def test_confirmation_scores_against_the_band_read_from_the_cv(monkeypatch) -> None:
    """The pre-target score must be banded by what the CV says, not by the entry
    default — otherwise a senior candidate's first score is measured against a
    fresher's bar and then silently moves when they accept the level Myro itself
    suggested on the next screen."""
    calls: list[str] = []
    baseline = {
        "id": 17,
        "kind": "baseline_upload",
        "skills_detected": [{"taxonomy_key": "Python (Programming Language)", "signal_type": "project"}],
        "cv_structured": {"experience": [{"dates": "Jan 2016 - Dec 2024"}]},
    }
    users = _UsersRepo(calls)
    monkeypatch.setattr(skill_confirmation, "CVVersionsRepository", lambda _db: _CVRepo(baseline, calls))
    monkeypatch.setattr(skill_confirmation, "ScoresRepository", lambda _db: object())
    monkeypatch.setattr(
        skill_confirmation.scoring,
        "build_cv_skill_rows",
        lambda *_args: [{"skill_id": 9, "matched_level": 2, "proficiency_title": "T", "evidence_text": "x"}],
    )
    monkeypatch.setattr(
        skill_confirmation.scoring, "recompute_score", lambda *_a: {"total_score": 41.0}
    )
    monkeypatch.setattr(skill_confirmation, "UsersRepository", lambda _db: users)
    monkeypatch.setattr(skill_confirmation, "OnboardingRepository", lambda _db: _OnboardingRepo(calls))

    skill_confirmation.confirm_baseline_skills(object(), "u1", 17, [])

    # ~9 years of dated experience → the lead band, not the entry default.
    assert users.updates == [{"target_seniority": "lead"}]


def test_confirmation_never_overwrites_a_level_the_user_chose(monkeypatch) -> None:
    calls: list[str] = []
    baseline = {
        "id": 17,
        "kind": "baseline_upload",
        "skills_detected": [{"taxonomy_key": "Python (Programming Language)", "signal_type": "project"}],
        "cv_structured": {"experience": [{"dates": "Jan 2016 - Dec 2024"}]},
    }
    users = _UsersRepo(calls, profile={"target_seniority": "entry"})
    monkeypatch.setattr(skill_confirmation, "CVVersionsRepository", lambda _db: _CVRepo(baseline, calls))
    monkeypatch.setattr(skill_confirmation, "ScoresRepository", lambda _db: object())
    monkeypatch.setattr(
        skill_confirmation.scoring,
        "build_cv_skill_rows",
        lambda *_args: [{"skill_id": 9, "matched_level": 2, "proficiency_title": "T", "evidence_text": "x"}],
    )
    monkeypatch.setattr(
        skill_confirmation.scoring, "recompute_score", lambda *_a: {"total_score": 41.0}
    )
    monkeypatch.setattr(skill_confirmation, "UsersRepository", lambda _db: users)
    monkeypatch.setattr(skill_confirmation, "OnboardingRepository", lambda _db: _OnboardingRepo(calls))

    skill_confirmation.confirm_baseline_skills(object(), "u1", 17, [])

    assert users.updates == []


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
