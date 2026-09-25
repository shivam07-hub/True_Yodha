"""A run that searched nothing may not claim a direction was searched.

`mark_match_run` writes both halves of the freshness answer: WHEN a run last
landed and WHICH direction it covered. `run_match` used to call it on every
path, including the two that return before a profile is even read — so a
`cache_hit` or a `needs_onboarding` moved the "new since your last search"
baseline and left `last_match_run_at` claiming a run for a direction nothing
ran against. Match Freshness reads that column; a false stamp there is
permanent, because no later run corrects a timestamp that already looks fresh.
"""
from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

import pytest

from app.services import jobs_workflow
from app.services.jobs_workflow import MatchComputeOutcome
from app.services.matching import match_run


class _Repo:
    def __init__(self, *, stamped: bool = True, raises: bool = False) -> None:
        self.calls: list[dict[str, Any]] = []
        self._stamped = stamped
        self._raises = raises

    def get_existing_match_job_ids(self, _user_id: str) -> list[str]:
        return []

    def mark_match_run(self, user_id: str, when: Any = None, *, context_key: Any = None) -> bool:
        self.calls.append({"user": user_id, "context_key": context_key})
        if self._raises:
            raise RuntimeError("profiles update failed")
        return self._stamped


def _run(monkeypatch: pytest.MonkeyPatch, outcome: MatchComputeOutcome, repo: _Repo) -> None:
    async def _compute(**_kwargs: Any) -> MatchComputeOutcome:
        return outcome

    monkeypatch.setattr(jobs_workflow, "compute_job_matches", _compute)
    monkeypatch.setattr(match_run.agent_picks, "regenerate_for_user", lambda *_a, **_k: None)
    monkeypatch.setattr(match_run.new_inventory, "resolve_for_user", lambda *_a, **_k: None)
    asyncio.run(
        match_run.run_match(
            repo, "u1", date(2026, 9, 21), regenerate_picks=False, notify=False
        )
    )


def _outcome(kind: str, *, context_key: str | None, written: int = 0) -> MatchComputeOutcome:
    return MatchComputeOutcome(
        kind=kind,  # type: ignore[arg-type]
        matches_written=written,
        batch_week=date(2026, 9, 21),
        context_key=context_key,
    )


def test_a_written_run_stamps_the_direction_it_covered(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _Repo()
    _run(monkeypatch, _outcome("written", context_key="ctx-abc", written=12), repo)
    assert repo.calls == [{"user": "u1", "context_key": "ctx-abc"}]


def test_an_exhausted_run_still_stamps(monkeypatch: pytest.MonkeyPatch) -> None:
    """"Searched this direction, the market had nothing" is a real answer, and
    the user is owed no second run for it."""
    repo = _Repo()
    _run(monkeypatch, _outcome("exhausted", context_key="ctx-abc"), repo)
    assert repo.calls == [{"user": "u1", "context_key": "ctx-abc"}]


def test_a_cache_hit_stamps_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """It returns before the profile is read, so it cannot name a direction —
    and it must not move the baseline either."""
    repo = _Repo()
    _run(monkeypatch, _outcome("cache_hit", context_key=None), repo)
    assert repo.calls == []


def test_needs_onboarding_stamps_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _Repo()
    _run(monkeypatch, _outcome("needs_onboarding", context_key=None), repo)
    assert repo.calls == []


def test_a_missed_stamp_does_not_lose_the_run(monkeypatch: pytest.MonkeyPatch) -> None:
    """The matches landed. Re-raising would re-run a full LLM compute to repair
    one column; the forward pass repairs it on the user's next visit instead."""
    repo = _Repo(stamped=False)
    _run(monkeypatch, _outcome("written", context_key="ctx-abc", written=3), repo)
    assert repo.calls == [{"user": "u1", "context_key": "ctx-abc"}]


def test_a_raising_stamp_does_not_lose_the_run(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _Repo(raises=True)
    _run(monkeypatch, _outcome("written", context_key="ctx-abc", written=3), repo)
    assert len(repo.calls) == 1
