"""The onboarding shortlist is scoped to the direction that produced it.

The screen and `commit_first_role` used to resolve "your current shortlist"
differently — the screen read the context-blind durable stack, the commit
filtered by (baseline, direction). After a direction change that gap put the
previous direction's cards on screen as clickable and answered the click with
409 "Choose a role from your current shortlist." Prod, 2026-08-04, twice in
seven seconds while the user stared at the role.

These cover the derived status: it must never guess, and it must never leave a
lost run as a permanent spinner.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.services import onboarding_service

_BASELINE = 17
_CONTEXT = "context-1"


def _row(job_id: str = "job-1") -> dict[str, Any]:
    return {
        "id": 1,
        "job_id": job_id,
        "baseline_version_id": _BASELINE,
        "target_context_hash": _CONTEXT,
        "overlap_score": 4,
        "llm_rank": 1,
        "matched_skills": ["Python"],
        "jobs": {"job_title": "Staff Engineer", "company_name": "Acme"},
    }


class _JobsRepo:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = rows or []

    def get_matches_for_context(
        self, _user_id: str, baseline_version_id: int, context_hash: str, *, limit: int = 3
    ) -> list[dict[str, Any]]:
        assert baseline_version_id == _BASELINE and context_hash == _CONTEXT
        return self.rows[:limit]


def _install(monkeypatch, rows: list[dict[str, Any]] | None = None) -> list[str]:
    """Wire the repo and capture heal enqueues. Returns the correlation ids."""
    monkeypatch.setattr(onboarding_service, "JobsRepository", lambda _db: _JobsRepo(rows))
    enqueued: list[str] = []
    monkeypatch.setattr(onboarding_service.background, "claim", lambda *_a, **_k: True)
    monkeypatch.setattr(
        onboarding_service.background,
        "enqueue",
        lambda lane, job_type, **kwargs: enqueued.append(f"{lane}:{job_type}"),
    )
    return enqueued


def _profile(*, changed_minutes_ago: float | None, ran_minutes_ago: float | None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    def _at(minutes: float | None) -> str | None:
        return None if minutes is None else (now - timedelta(minutes=minutes)).isoformat()

    return {
        "target_updated_at": _at(changed_minutes_ago),
        "last_match_run_at": _at(ran_minutes_ago),
    }


def _call(db_profile: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    return onboarding_service._shortlist(object(), "u1", db_profile, _BASELINE, _CONTEXT)


def test_rows_for_this_direction_are_ready_and_job_match_shaped(monkeypatch) -> None:
    _install(monkeypatch, [_row()])
    rows, status = _call(_profile(changed_minutes_ago=1, ran_minutes_ago=None))
    assert status == "ready"
    # Serialized through the same read model the dashboard uses, so the client
    # renders one shape whichever surface it came from.
    assert rows[0]["job_id"] == "job-1"
    assert rows[0]["title"] == "Staff Engineer"
    assert rows[0]["company"] == "Acme"


def test_run_that_finished_after_the_change_with_no_rows_is_empty(monkeypatch) -> None:
    enqueued = _install(monkeypatch)
    rows, status = _call(_profile(changed_minutes_ago=30, ran_minutes_ago=20))
    assert (rows, status) == ([], "empty")
    # A completed run that matched nothing is an answer, not a fault — never
    # re-run it behind the user's back.
    assert enqueued == []


def test_outstanding_run_inside_the_grace_window_is_computing(monkeypatch) -> None:
    enqueued = _install(monkeypatch)
    rows, status = _call(_profile(changed_minutes_ago=1, ran_minutes_ago=30))
    assert (rows, status) == ([], "computing")
    assert enqueued == []


def test_never_run_and_just_changed_is_computing(monkeypatch) -> None:
    _install(monkeypatch)
    assert _call(_profile(changed_minutes_ago=0.5, ran_minutes_ago=None))[1] == "computing"


def test_outstanding_run_past_grace_is_stalled_and_reenqueued_on_the_fast_lane(monkeypatch) -> None:
    enqueued = _install(monkeypatch)
    rows, status = _call(_profile(changed_minutes_ago=30, ran_minutes_ago=45))
    assert (rows, status) == ([], "stalled")
    # A read that can only report leaves a lost job lost. Fast lane: the user is
    # on the result screen watching for exactly this.
    assert enqueued == ["fast:initial_match"]


def test_heal_is_debounced(monkeypatch) -> None:
    enqueued = _install(monkeypatch)
    monkeypatch.setattr(onboarding_service.background, "claim", lambda *_a, **_k: False)
    assert _call(_profile(changed_minutes_ago=30, ran_minutes_ago=45))[1] == "stalled"
    assert enqueued == []


def test_heal_failure_never_takes_down_the_result_read(monkeypatch) -> None:
    _install(monkeypatch)

    def _boom(*_a, **_k):
        raise RuntimeError("redis down")

    monkeypatch.setattr(onboarding_service.background, "enqueue", _boom)
    assert _call(_profile(changed_minutes_ago=30, ran_minutes_ago=45))[1] == "stalled"


def test_unparseable_timestamps_degrade_to_computing_not_a_crash(monkeypatch) -> None:
    _install(monkeypatch)
    profile = {"target_updated_at": "not-a-date", "last_match_run_at": "also-not"}
    assert _call(profile)[1] == "computing"
