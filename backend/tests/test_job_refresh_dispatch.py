from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

import pytest

from app.services.job_refresh import _dispatch
from app.services.job_refresh.facade import JobRefresh
from app.services.jobs_workflow import MatchComputeOutcome


def test_dispatch_runs_inline_when_redis_refresh_queue_has_no_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_dispatch.settings, "redis_url", "redis://fake:6379/0")
    monkeypatch.setattr(_dispatch, "_has_active_refresh_worker", lambda: False)
    monkeypatch.setattr(
        _dispatch,
        "_enqueue_refresh_rq",
        lambda **_kwargs: pytest.fail("should not enqueue to an unserved refresh queue"),
    )
    states: list[tuple[str, Any]] = []
    monkeypatch.setattr(_dispatch, "_write_state", lambda user_id, state: states.append((user_id, state)))

    async def fake_run(*_args: Any, **_kwargs: Any) -> MatchComputeOutcome:
        return MatchComputeOutcome(kind="written", matches_written=2, batch_week=date(2026, 6, 1))

    monkeypatch.setattr(_dispatch._pipeline, "run", fake_run)

    async def run() -> None:
        ticket = await _dispatch.dispatch(
            user_id="user-1",
            batch_week=date(2026, 6, 1),
            excluded_job_ids=[],
            xp_charged=50,
            new_coin_balance=450,
        )
        assert ticket.state == "queued"
        await asyncio.sleep(0)
        await asyncio.sleep(0)

    asyncio.run(run())

    assert [state.state for _, state in states] == ["queued", "computing", "done"]
    assert states[-1][0] == "user-1"
    assert states[-1][1].matches_written == 2


class _RefreshRepo:
    def __init__(self, new_jobs: int = 0) -> None:
        self.batch_week_arg: date | None = date(1999, 1, 1)
        self._new_jobs = new_jobs

    def get_existing_match_job_ids(self, user_id: str, batch_week: date | None = None) -> list[str]:
        self.batch_week_arg = batch_week
        assert user_id == "user-1"
        return ["old-job", "older-job"]

    def count_new_jobs_for_user(self, user_id: str) -> int:
        assert user_id == "user-1"
        return self._new_jobs


def _fake_ticket(**kwargs: Any):
    return type(
        "Ticket",
        (),
        {
            "id": "ticket-1",
            "state": "queued",
            "progress_label": "Queued",
            "batch_week": kwargs["batch_week"],
            "xp_charged": kwargs["xp_charged"],
            "new_coin_balance": kwargs["new_coin_balance"],
            "matches_written": None,
        },
    )()


def test_refresh_excludes_all_prior_match_jobs_for_novelty(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _RefreshRepo(new_jobs=0)  # no new inventory → the paid path
    captured: dict[str, Any] = {}

    async def fake_charge(*_args: Any, **_kwargs: Any) -> int:
        return 450

    async def fake_dispatch(**kwargs: Any):
        captured.update(kwargs)
        return _fake_ticket(**kwargs)

    monkeypatch.setattr("app.services.job_refresh._xp_charge.charge", fake_charge)
    monkeypatch.setattr("app.services.job_refresh._dispatch.dispatch", fake_dispatch)

    ticket = asyncio.run(JobRefresh.start("user-1", repo, date(2026, 6, 1)))  # type: ignore[arg-type]

    assert ticket.id == "ticket-1"
    assert repo.batch_week_arg is None
    assert captured["excluded_job_ids"] == ["old-job", "older-job"]
    assert captured["xp_charged"] == 100  # MATCH_RUN_COST — flat, every run


def test_refresh_charges_flat_even_when_new_jobs_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    """Standardized matcher: EVERY run costs the flat MATCH_RUN_COST — the old
    'free when new jobs' waiver (#36 N2) is gone. New jobs present → still charged.
    The fairness backstop (refund a no-op run) stays at _dispatch, not here."""
    repo = _RefreshRepo(new_jobs=12)
    captured: dict[str, Any] = {}

    async def fake_charge(*_args: Any, **_kwargs: Any) -> int:
        return 450

    async def fake_dispatch(**kwargs: Any):
        captured.update(kwargs)
        return _fake_ticket(**kwargs)

    monkeypatch.setattr("app.services.job_refresh._xp_charge.charge", fake_charge)
    monkeypatch.setattr("app.services.job_refresh._dispatch.dispatch", fake_dispatch)

    ticket = asyncio.run(JobRefresh.start("user-1", repo, date(2026, 6, 1)))  # type: ignore[arg-type]

    assert ticket.xp_charged == 100
    assert captured["xp_charged"] == 100  # charged despite new inventory
    assert captured["new_coin_balance"] == 450


def test_rq_connection_is_binary_state_connection_is_decoded(monkeypatch) -> None:
    """Regression: RQ pickles job payloads, so its Redis connection MUST be
    binary. A decoded (decode_responses=True) RQ connection crashes the worker
    with UnicodeDecodeError on dequeue → no worker → every refresh runs inline.
    App JSON state stays on a decoded connection."""
    from app.services.job_refresh import _redis_state

    monkeypatch.setattr(_redis_state.settings, "redis_url", "redis://localhost:6379/0")

    rq = _redis_state._rq_connection()
    state = _redis_state._connection()

    assert rq.connection_pool.connection_kwargs.get("decode_responses") in (None, False)
    assert state.connection_pool.connection_kwargs.get("decode_responses") is True
