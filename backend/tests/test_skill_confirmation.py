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

    def mirror_score_exists(self, _user_id: str) -> bool:
        return False


class _ScoresRepoForConfirm:
    """Confirm path needs taxonomy helpers mocked elsewhere; only existence matters."""

    def __init__(self, *, mirror_exists: bool = False) -> None:
        self._mirror_exists = mirror_exists

    def mirror_score_exists(self, _user_id: str) -> bool:
        return self._mirror_exists


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


def _patch_handoff(monkeypatch, calls: list[str], next_step: dict[str, Any] | None = None):
    """Replace the two things confirmation hands off to, and record the order."""
    def _enqueue(_user_id: str, *, reason: str, force: bool = False, score_fresh: bool = False) -> bool:
        suffix = ""
        if force:
            suffix += ":force"
        if score_fresh:
            suffix += ":fresh"
        calls.append(f"enqueue:{reason}{suffix}")
        return True

    def _awaiting(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        calls.append("awaiting_target")
        return next_step if next_step is not None else {
            "kind": "awaiting_target",
            "families": [],
            "ninja": {"ninja_name": "quiet-fox-9k2v", "claimed": False},
        }

    def _get_result(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        calls.append("get_result")
        return next_step if next_step is not None else {"kind": "awaiting_target"}

    monkeypatch.setattr(skill_confirmation.onboarding_service, "enqueue_score_refresh", _enqueue)
    monkeypatch.setattr(skill_confirmation.onboarding_service, "_awaiting_target_payload", _awaiting)
    monkeypatch.setattr(skill_confirmation.onboarding_service, "get_result", _get_result)
    monkeypatch.setattr(
        skill_confirmation.scoring,
        "recompute_score",
        lambda *_a: pytest.fail("the score must not be computed on the confirm request"),
    )


def test_confirmation_publishes_skills_then_hands_the_score_off(monkeypatch) -> None:
    """The score is NOT awaited here.

    It used to be: 8.4s measured on prod, paid by a user whose next screen is the
    direction step — which is deliberately score-free. The score depends on the
    confirmed skills and the band alone, so it can run while the user chooses; the
    row exists by the time Market needs it. `enqueue_score_refresh` is the write.
    """
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
    monkeypatch.setattr(
        skill_confirmation, "ScoresRepository", lambda _db: _ScoresRepoForConfirm(),
    )
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
    monkeypatch.setattr(skill_confirmation, "UsersRepository", lambda _db: _UsersRepo(calls))
    _patch_handoff(monkeypatch, calls, next_step={"kind": "awaiting_target", "families": []})

    result = skill_confirmation.confirm_baseline_skills(object(), "u1", 17, [])

    # The next step's payload rides back on this response. The client used to throw
    # it away and immediately GET the same thing — 8.2s of re-asking on top of the
    # 8.4s above, for one button press.
    assert result["next"] == "target"
    assert result["result"]["kind"] == "awaiting_target"
    assert result["result"]["families"] == []
    # No `cv_structured` on this baseline → the CV says nothing about seniority, so
    # nothing is written. Unknown stays unknown; the direction step asks.
    # No "state" patch: the journey position is derived from these very facts now,
    # so confirming skills IS the state change — there is nothing to also record.
    assert calls == ["confirm", "enqueue:skills_confirmed", "awaiting_target"]
    # Publication still strictly precedes the score being asked for.
    assert calls.index("confirm") < calls.index("enqueue:skills_confirmed")


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
    monkeypatch.setattr(
        skill_confirmation, "ScoresRepository", lambda _db: _ScoresRepoForConfirm(),
    )
    monkeypatch.setattr(
        skill_confirmation.scoring,
        "build_cv_skill_rows",
        lambda *_args: [{"skill_id": 9, "matched_level": 2, "proficiency_title": "T", "evidence_text": "x"}],
    )
    monkeypatch.setattr(skill_confirmation, "UsersRepository", lambda _db: users)
    _patch_handoff(monkeypatch, calls)

    skill_confirmation.confirm_baseline_skills(object(), "u1", 17, [])

    # ~9 years of dated experience → the lead band, not the entry default.
    assert users.updates == [{"target_seniority": "lead"}]
    # The band is an INPUT to the score, so it must be written before the score is
    # asked for. Handing the score off does not make the ordering optional — a
    # refresh that starts first would band a senior candidate as a fresher.
    assert calls.index("seniority") < calls.index("enqueue:skills_confirmed")


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
    monkeypatch.setattr(
        skill_confirmation, "ScoresRepository", lambda _db: _ScoresRepoForConfirm(),
    )
    monkeypatch.setattr(
        skill_confirmation.scoring,
        "build_cv_skill_rows",
        lambda *_args: [{"skill_id": 9, "matched_level": 2, "proficiency_title": "T", "evidence_text": "x"}],
    )
    monkeypatch.setattr(skill_confirmation, "UsersRepository", lambda _db: users)
    _patch_handoff(monkeypatch, calls)

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

    # Nothing written and nothing enqueued — pending skills mean there is no score
    # to compute and no direction to match against.
    assert calls == []


def test_target_refresh_scores_but_does_not_match_before_a_direction_exists(
    monkeypatch,
) -> None:
    """This handler is now also the score path for a just-confirmed user who has
    NOT chosen a direction yet. The shortlist is direction-scoped, so running the
    Career-Ops brain here would spend a real LLM pass on a question nobody asked.
    """
    calls: list[str] = []
    baseline = {"id": 17, "kind": "baseline_upload", "skills_confirmed_at": "2026-08-04T00:00:00+00:00"}

    class _Scores:
        def get_user_skill_level_map(self, _user_id: str) -> dict[str, int]:
            return {"Python (Programming Language)": 2}

        def mirror_score_exists(self, _user_id: str) -> bool:
            return False

    monkeypatch.setattr(onboarding_service, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CVRepo(baseline, calls))
    monkeypatch.setattr(onboarding_service, "ScoresRepository", lambda _db: _Scores())
    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _OnboardingRepo(calls))
    # No target on the profile — the user is still on the direction step.
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _UsersRepo(calls, profile={}))
    monkeypatch.setattr(
        onboarding_service.scoring,
        "recompute_score",
        lambda *_a: calls.append("score") or {"total_score": 41.0},
    )
    monkeypatch.setattr(
        onboarding_service.background,
        "enqueue",
        lambda *_args, **_kwargs: pytest.fail("no direction means no shortlist run"),
    )

    asyncio.run(
        onboarding_service.refresh_target_result({"user_id": "u1"}, allow_retry=False)
    )

    assert "score" in calls, "the score does not need a direction — it must still run"


def test_target_refresh_skips_recompute_when_provisional_score_is_fresh(
    monkeypatch,
) -> None:
    calls: list[str] = []
    baseline = {
        "id": 17,
        "kind": "baseline_upload",
        "skills_confirmed_at": "2026-08-04T00:00:00+00:00",
    }

    class _Scores:
        def get_user_skill_level_map(self, _user_id: str) -> dict[str, int]:
            return {"Python (Programming Language)": 2}

        def mirror_score_exists(self, _user_id: str) -> bool:
            return True

    monkeypatch.setattr(onboarding_service, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CVRepo(baseline, calls))
    monkeypatch.setattr(onboarding_service, "ScoresRepository", lambda _db: _Scores())
    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _OnboardingRepo(calls))
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _UsersRepo(calls, profile={}))
    monkeypatch.setattr(
        onboarding_service.scoring,
        "recompute_score",
        lambda *_a: pytest.fail("fresh provisional score must not recompute"),
    )
    monkeypatch.setattr(
        onboarding_service.background,
        "enqueue",
        lambda *_args, **_kwargs: pytest.fail("no direction means no shortlist run"),
    )

    asyncio.run(
        onboarding_service.refresh_target_result(
            {"user_id": "u1", "score_fresh": True}, allow_retry=False,
        )
    )


def test_confirmation_skips_enqueue_when_provisional_score_already_landed(
    monkeypatch,
) -> None:
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
    monkeypatch.setattr(skill_confirmation, "CVVersionsRepository", lambda _db: _CVRepo(baseline, calls))
    monkeypatch.setattr(
        skill_confirmation,
        "ScoresRepository",
        lambda _db: _ScoresRepoForConfirm(mirror_exists=True),
    )
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
    monkeypatch.setattr(skill_confirmation, "UsersRepository", lambda _db: _UsersRepo(calls))
    _patch_handoff(monkeypatch, calls)

    skill_confirmation.confirm_baseline_skills(object(), "u1", 17, [])

    assert calls == ["confirm", "awaiting_target"]


def test_confirmation_forces_recompute_when_user_excludes_a_skill(monkeypatch) -> None:
    calls: list[str] = []
    baseline = {
        "id": 17,
        "kind": "baseline_upload",
        "skills_detected": [
            {
                "taxonomy_key": "Python (Programming Language)",
                "signal_type": "project",
                "evidence": "Built a Python service",
            },
            {
                "taxonomy_key": "SQL",
                "signal_type": "project",
                "evidence": "Wrote queries",
            },
        ],
    }
    monkeypatch.setattr(skill_confirmation, "CVVersionsRepository", lambda _db: _CVRepo(baseline, calls))
    monkeypatch.setattr(
        skill_confirmation,
        "ScoresRepository",
        lambda _db: _ScoresRepoForConfirm(mirror_exists=True),
    )
    monkeypatch.setattr(
        skill_confirmation.scoring,
        "build_cv_skill_rows",
        lambda *_args: [
            {
                "skill_id": 9,
                "matched_level": 2,
                "proficiency_title": "Trailblazer",
                "evidence_text": "Built a Python service",
                "source": "cv",
            },
            {
                "skill_id": 10,
                "matched_level": 2,
                "proficiency_title": "Trailblazer",
                "evidence_text": "Wrote queries",
                "source": "cv",
            },
        ],
    )
    monkeypatch.setattr(skill_confirmation, "UsersRepository", lambda _db: _UsersRepo(calls))
    _patch_handoff(monkeypatch, calls)

    skill_confirmation.confirm_baseline_skills(
        object(),
        "u1",
        17,
        [{"skill_id": 9, "action": "exclude"}],
    )

    assert "enqueue:skills_confirmed:force" in calls