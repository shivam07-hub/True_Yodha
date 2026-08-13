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


def _row(job_id: str = "job-1", *, rated: bool = True) -> dict[str, Any]:
    """A match row. `rated=False` is a Provisional Match — real overlap, written
    the moment triage picked it, with no verdict yet."""
    row: dict[str, Any] = {
        "id": 1,
        "job_id": job_id,
        "baseline_version_id": _BASELINE,
        "target_context_hash": _CONTEXT,
        "overlap_score": 4,
        "llm_rank": 1,
        "matched_skills": ["Python"],
        "jobs": {"job_title": "Staff Engineer", "company_name": "Acme"},
    }
    if rated:
        row["overall_score"] = 4.1
        row["recommendation"] = "apply"
    return row


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


def _profile(
    *,
    changed_minutes_ago: float | None,
    ran_minutes_ago: float | None,
    ran_context: str | None = _CONTEXT,
) -> dict[str, Any]:
    """`ran_context` is WHICH direction the finished run covered. Defaults to the
    one under test, because "a run finished" and "a run finished for this
    direction" are different facts and only the second licenses `empty`."""
    now = datetime.now(timezone.utc)

    def _at(minutes: float | None) -> str | None:
        return None if minutes is None else (now - timedelta(minutes=minutes)).isoformat()

    return {
        "target_updated_at": _at(changed_minutes_ago),
        "last_match_run_at": _at(ran_minutes_ago),
        "last_match_context_hash": ran_context,
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


def test_a_triaged_shortlist_without_verdicts_is_provisional(monkeypatch) -> None:
    """The shortlist is persisted the moment triage picks it, minutes before the
    deep eval scores it. Those rows are choosable — but reporting them `ready`
    stopped the client's poll, so the upgrade never reached the screen."""
    _install(monkeypatch, [_row(rated=False)])
    rows, status = _call(_profile(changed_minutes_ago=1, ran_minutes_ago=None))
    assert status == "provisional"
    assert rows[0]["verdict"] == "checking"


def test_a_finished_run_makes_an_unrated_row_final(monkeypatch) -> None:
    """Whatever a row still lacks after the run completed is not coming. Holding
    `provisional` on it would poll forever for an upgrade that already failed."""
    _install(monkeypatch, [_row(rated=False)])
    _rows, status = _call(_profile(changed_minutes_ago=30, ran_minutes_ago=20))
    assert status == "ready"


def test_run_that_finished_for_THIS_direction_with_no_rows_is_empty(monkeypatch) -> None:
    enqueued = _install(monkeypatch)
    rows, status = _call(_profile(changed_minutes_ago=30, ran_minutes_ago=20))
    assert (rows, status) == ([], "empty")
    # A completed run that matched nothing is an answer, not a fault — never
    # re-run it behind the user's back.
    assert enqueued == []


# ── "a run finished" is not "this direction was searched" ──────────────────────
#
# `last_match_run_at` alone was read as an answer to a question it cannot answer.
# Every context with no rows fell to `empty` — "the market genuinely has no
# overlap" — over stacks of real matches. 162 of 196 users on 2026-08-13, holding
# 1,289 match rows between them.

def test_a_run_for_a_DIFFERENT_direction_is_not_an_empty_market(monkeypatch) -> None:
    enqueued = _install(monkeypatch)
    rows, status = _call(
        _profile(changed_minutes_ago=30, ran_minutes_ago=20, ran_context="some-other-direction")
    )
    assert (rows, status) == ([], "stale_direction")
    # The user pulls the run. Never auto-enqueue one behind them.
    assert enqueued == []


def test_a_run_that_never_recorded_its_direction_is_not_an_empty_market(monkeypatch) -> None:
    """Every row written before the run stamped its context — the whole existing
    population at the time of this change."""
    _install(monkeypatch)
    rows, status = _call(_profile(changed_minutes_ago=30, ran_minutes_ago=20, ran_context=None))
    assert (rows, status) == ([], "stale_direction")


def test_stale_direction_never_masks_a_run_still_owed(monkeypatch) -> None:
    """A direction changed after the last run is still `computing`/`stalled` — the
    context split must not swallow the outstanding-run states."""
    _install(monkeypatch)
    _rows, fresh = _call(
        _profile(changed_minutes_ago=1, ran_minutes_ago=30, ran_context="other")
    )
    assert fresh == "computing"


def test_rows_for_this_direction_win_regardless_of_the_stamp(monkeypatch) -> None:
    """The stamp only arbitrates the EMPTY case. Rows on screen are rows on screen."""
    _install(monkeypatch, [_row()])
    _rows, status = _call(
        _profile(changed_minutes_ago=30, ran_minutes_ago=20, ran_context="other")
    )
    assert status == "ready"


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


def test_unused_ops_inputs_reports_only_what_is_genuinely_missing() -> None:
    """The receipt names the Career-Ops inputs the run did NOT have.

    Whitespace is not an answer, and an empty list is not a deal-breaker — a
    field that looks set but carries nothing would tell the user the run used
    something it never saw.
    """
    assert onboarding_service._unused_ops_inputs({}) == [
        "deal_breakers", "career_goal", "superpower",
    ]
    assert onboarding_service._unused_ops_inputs(
        {"deal_breakers": [], "career_goal": "   ", "superpower": "untangling legacy systems"}
    ) == ["deal_breakers", "career_goal"]
    assert onboarding_service._unused_ops_inputs(
        {"deal_breakers": ["no relocation"], "career_goal": "platform work", "superpower": "x"}
    ) == []
