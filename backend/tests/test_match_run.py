"""Match Run — the one module every match surface routes through.

Guarantees the outputs of a run never drift per-path: compute → Agent Picks regen →
(conditional) fresh-match notification, with picks/notify as guarded side-effects.
"""
from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

from app.services.jobs_workflow import MatchComputeOutcome
from app.services.matching import match_run

# A realistic outcome, not a bare sentinel: `run_match` reads `context_key` off it
# to stamp WHICH direction the run covered, and a fake that cannot answer that
# would hide the read behind the marker's own try/except.
_OUTCOME = MatchComputeOutcome(
    kind="written", matches_written=1, batch_week=date(2026, 7, 28), context_key="ctx-abc",
)


class _FakeRepo:
    client = object()

    def __init__(self, before: list[str], after: list[dict[str, Any]]) -> None:
        self._before = before
        self._after = after
        self.marked = 0

    def mark_match_run(self, _user_id: str, *, context_key: str | None = None) -> None:
        self.marked += 1
        self.marked_context = context_key

    def get_existing_match_job_ids(self, _user_id: str) -> list[str]:
        return self._before

    def get_user_match_stack(self, _user_id: str) -> list[dict[str, Any]]:
        return self._after


def _wire(monkeypatch, *, picks_raises: bool = False) -> dict[str, Any]:
    calls: dict[str, Any] = {"compute": 0, "picks": 0, "notify": 0}

    async def _fake_compute(**kwargs: Any):
        calls["compute"] += 1
        calls["compute_kwargs"] = kwargs
        return _OUTCOME

    def _fake_regen(_repo, _user_id, *, scrape_batch=None):
        calls["picks"] += 1
        calls["scrape_batch"] = scrape_batch
        if picks_raises:
            raise RuntimeError("picks boom")
        return 3

    class _FakeNotifs:
        def __init__(self, *_a): ...
        def record_fresh_matches(self, *_a, **_k):
            calls["notify"] += 1

    monkeypatch.setattr(match_run.jobs_workflow, "compute_job_matches", _fake_compute)
    monkeypatch.setattr(match_run.agent_picks, "regenerate_for_user", _fake_regen)
    monkeypatch.setattr(match_run, "NotificationsRepository", _FakeNotifs)

    def _fake_resolve(user_id: str) -> None:
        calls["resolved"] = calls.get("resolved", 0) + 1

    monkeypatch.setattr(match_run.new_inventory, "resolve_for_user", _fake_resolve)
    return calls


def test_run_match_computes_regenerates_picks_and_notifies(monkeypatch) -> None:
    calls = _wire(monkeypatch)
    repo = _FakeRepo(before=["j1"], after=[{"job_id": "j1"}, {"job_id": "j2", "overall_score": 4.2}])

    out = asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 13), scrape_batch=20260713))

    assert out is _OUTCOME
    assert calls["compute"] == 1
    assert calls["picks"] == 1
    assert calls["scrape_batch"] == 20260713
    assert calls["notify"] == 1  # j2 is new (not in before) → notification fires


def test_run_match_notify_false_skips_notification(monkeypatch) -> None:
    calls = _wire(monkeypatch)
    repo = _FakeRepo(before=[], after=[{"job_id": "j2", "overall_score": 4.2}])

    asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 13), notify=False))

    assert calls["compute"] == 1
    assert calls["picks"] == 1  # picks still regenerate
    assert calls["notify"] == 0  # the reveal is live — no bell


def test_run_match_no_new_matches_skips_notification(monkeypatch) -> None:
    calls = _wire(monkeypatch)
    repo = _FakeRepo(before=["j1"], after=[{"job_id": "j1"}])  # nothing new

    asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 13)))

    assert calls["notify"] == 0  # compute-then-notify: never fire on a no-op recompute


def test_run_match_picks_failure_never_breaks_the_run(monkeypatch) -> None:
    calls = _wire(monkeypatch, picks_raises=True)
    repo = _FakeRepo(before=[], after=[{"job_id": "j2", "overall_score": 4.2}])

    out = asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 13)))

    assert out is _OUTCOME  # compute outcome still returned
    assert calls["notify"] == 1  # notify still fires despite the picks failure


def test_run_match_regenerate_picks_false_skips_band(monkeypatch) -> None:
    calls = _wire(monkeypatch)
    repo = _FakeRepo(before=[], after=[])
    asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 13), regenerate_picks=False))
    assert calls["picks"] == 0


def test_run_match_stamps_the_run_marker_and_retires_the_prompt(monkeypatch) -> None:
    """The baseline for "new since your last search" moves ONLY here. Inferring it
    from user_job_matches.computed_at let a passive feed-warm eval reset it, so the
    announcement retired itself without the user searching."""
    calls = _wire(monkeypatch)
    repo = _FakeRepo(before=[], after=[])

    asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 28)))

    assert repo.marked == 1
    assert calls["resolved"] == 1


def test_run_marker_failure_never_breaks_the_run(monkeypatch) -> None:
    calls = _wire(monkeypatch)

    class _BadRepo(_FakeRepo):
        def mark_match_run(self, _user_id: str, *, context_key: str | None = None) -> None:
            raise RuntimeError("profiles write failed")

    out = asyncio.run(match_run.run_match(_BadRepo(before=[], after=[]), "u1", date(2026, 7, 28)))
    assert out is _OUTCOME
    assert calls["compute"] == 1


def test_the_run_stamps_which_direction_it_covered(monkeypatch) -> None:
    """`last_match_run_at` says a run happened; it cannot say what it ran against.
    Reading the first as an answer to the second is what told 162 users holding
    1,289 real match rows that "the market genuinely has no overlap"."""
    _wire(monkeypatch)
    repo = _FakeRepo(before=[], after=[])
    asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 28)))
    assert repo.marked == 1
    assert repo.marked_context == "ctx-abc"


def test_a_run_that_computed_nothing_claims_no_direction(monkeypatch) -> None:
    """cache_hit / needs_onboarding return before a profile exists. Stamping a key
    there would claim coverage the run never gave."""
    calls: dict[str, Any] = {}

    async def _no_profile_compute(**kwargs: Any):
        calls["compute"] = kwargs
        return MatchComputeOutcome(kind="cache_hit", matches_written=0, batch_week=date(2026, 7, 28))

    monkeypatch.setattr(match_run.jobs_workflow, "compute_job_matches", _no_profile_compute)
    monkeypatch.setattr(match_run.agent_picks, "regenerate_for_user", lambda *a, **k: None)
    monkeypatch.setattr(match_run.new_inventory, "resolve_for_user", lambda *a, **k: None)

    repo = _FakeRepo(before=[], after=[])
    asyncio.run(match_run.run_match(repo, "u1", date(2026, 7, 28), notify=False))
    assert repo.marked == 1              # the run still happened
    assert repo.marked_context is None   # but it covered no direction
