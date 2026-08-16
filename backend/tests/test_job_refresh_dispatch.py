from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

import pytest
from fastapi import HTTPException

from app.services.job_refresh import _dispatch
from app.services.job_refresh.facade import JobRefresh
from app.services.job_refresh.types import PROGRESS_LABELS, QUEUED_STRANDED_SECONDS, RefreshState, SEARCH_UNAVAILABLE
from app.services.jobs_workflow import MatchComputeOutcome


def test_dispatch_runs_inline_when_redis_is_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_dispatch.settings, "redis_url", "   ")
    monkeypatch.setattr(
        _dispatch,
        "_enqueue_refresh_rq",
        lambda **_kwargs: pytest.fail("local mode must not enqueue"),
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


def test_dispatch_refuses_when_redis_has_no_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    """A dead Job Runner used to inline the Match Run on the API event loop,
    which blocked the progress stream and looked like a hung first step."""
    monkeypatch.setattr(_dispatch.settings, "redis_url", "redis://fake:6379/0")
    monkeypatch.setattr(_dispatch, "_has_active_refresh_worker", lambda: False)
    monkeypatch.setattr(
        _dispatch,
        "_enqueue_refresh_rq",
        lambda **_kwargs: pytest.fail("must not enqueue to an unserved queue"),
    )
    writes: list[Any] = []
    monkeypatch.setattr(_dispatch, "_write_state", lambda _user_id, state: writes.append(state))
    refunds: list[int] = []

    async def fake_refund(_user_id: str, amount: int) -> int:
        refunds.append(amount)
        return 400

    monkeypatch.setattr(_dispatch._xp_charge, "refund", fake_refund)

    async def run() -> None:
        with pytest.raises(HTTPException) as ei:
            await _dispatch.dispatch(
                user_id="user-1",
                batch_week=date(2026, 6, 1),
                excluded_job_ids=[],
                xp_charged=50,
                new_coin_balance=450,
            )
        assert ei.value.status_code == 503
        assert ei.value.detail == SEARCH_UNAVAILABLE

    asyncio.run(run())
    assert refunds == [50]
    assert writes == []


def test_start_does_not_charge_when_the_runner_is_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_dispatch, "cannot_run", lambda: True)

    async def fake_charge(_user_id: str, _amount: int) -> int:
        raise AssertionError("do not debit a search that cannot start")

    monkeypatch.setattr("app.services.job_refresh._xp_charge.charge", fake_charge)

    repo = _RefreshRepo(new_jobs=0)
    with pytest.raises(HTTPException) as ei:
        asyncio.run(JobRefresh.start("user-1", repo, date(2026, 6, 1)))  # type: ignore[arg-type]
    assert ei.value.status_code == 503
    assert ei.value.detail == SEARCH_UNAVAILABLE


def _queued(**kw: Any) -> RefreshState:
    return RefreshState(
        ticket_id="t1",
        state="queued",
        progress_label=PROGRESS_LABELS["queued"],
        batch_week=date(2026, 6, 1),
        xp_charged=kw.get("xp_charged", 50),
    )


def test_abandon_stranded_refunds_when_the_runner_is_gone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_dispatch.settings, "redis_url", "redis://fake:6379/0")
    monkeypatch.setattr(_dispatch, "_has_active_refresh_worker", lambda: False)
    monkeypatch.setattr(_dispatch, "read_state", lambda _u, _t: _queued())
    monkeypatch.setattr(_dispatch, "_cancel_queued_job", lambda _u, _t: None)
    writes: list[RefreshState] = []
    monkeypatch.setattr(_dispatch, "_write_state", lambda _u, state: writes.append(state))
    refunds: list[int] = []

    async def fake_refund(_user_id: str, amount: int) -> int:
        refunds.append(amount)
        return 400

    monkeypatch.setattr(_dispatch._xp_charge, "refund", fake_refund)

    result = asyncio.run(_dispatch.abandon_stranded("u1", "t1", queued_for=float(QUEUED_STRANDED_SECONDS)))
    assert result is not None
    assert result.state == "failed"
    assert result.error == SEARCH_UNAVAILABLE
    assert result.refund == 50
    assert refunds == [50]
    assert writes and writes[-1].state == "failed"


def test_abandon_stranded_waits_while_a_runner_is_alive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_dispatch.settings, "redis_url", "redis://fake:6379/0")
    monkeypatch.setattr(_dispatch, "_has_active_refresh_worker", lambda: True)
    monkeypatch.setattr(_dispatch, "read_state", lambda _u, _t: _queued())

    def _no_write(*_a: Any, **_k: Any) -> None:
        raise AssertionError("a live runner is a wait, not a failure")

    monkeypatch.setattr(_dispatch, "_write_state", _no_write)

    result = asyncio.run(_dispatch.abandon_stranded("u1", "t1", queued_for=30.0))
    assert result is None


def test_abandon_stranded_does_not_fire_before_grace(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_dispatch.settings, "redis_url", "redis://fake:6379/0")
    monkeypatch.setattr(_dispatch, "_has_active_refresh_worker", lambda: False)

    result = asyncio.run(_dispatch.abandon_stranded("u1", "t1", queued_for=QUEUED_STRANDED_SECONDS - 1))
    assert result is None


def test_abandon_stranded_does_not_overwrite_a_started_run(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_dispatch.settings, "redis_url", "redis://fake:6379/0")
    monkeypatch.setattr(_dispatch, "_has_active_refresh_worker", lambda: False)
    started = RefreshState(
        ticket_id="t1",
        state="computing",
        progress_label=PROGRESS_LABELS["computing"],
        batch_week=date(2026, 6, 1),
        xp_charged=50,
    )
    monkeypatch.setattr(_dispatch, "read_state", lambda _u, _t: started)
    monkeypatch.setattr(_dispatch, "_cancel_queued_job", lambda _u, _t: None)

    def _no_write(*_a: Any, **_k: Any) -> None:
        raise AssertionError("must not fail a ticket the runner already picked up")

    monkeypatch.setattr(_dispatch, "_write_state", _no_write)

    result = asyncio.run(_dispatch.abandon_stranded("u1", "t1", queued_for=30.0))
    assert result is None


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
            "progress_label": "Waiting to start",
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

    monkeypatch.setattr(_dispatch, "cannot_run", lambda: False)
    monkeypatch.setattr("app.services.job_refresh._xp_charge.charge", fake_charge)
    monkeypatch.setattr("app.services.job_refresh._dispatch.dispatch", fake_dispatch)

    ticket = asyncio.run(JobRefresh.start("user-1", repo, date(2026, 6, 1)))  # type: ignore[arg-type]

    assert ticket.id == "ticket-1"
    assert repo.batch_week_arg is None
    assert captured["excluded_job_ids"] == ["old-job", "older-job"]
    assert captured["xp_charged"] == 100  # MATCH_RUN_COST — flat, every run


def test_refresh_is_free_when_myro_landed_new_inventory(monkeypatch: pytest.MonkeyPatch) -> None:
    """Value first (2026-07-28): Myro ingested roles this user has never been
    matched against and told them so — they don't pay to look at inventory they
    didn't ask for. The wallet is not touched at all on this path."""
    repo = _RefreshRepo(new_jobs=12)
    captured: dict[str, Any] = {}

    async def fake_charge(*_args: Any, **_kwargs: Any) -> int:
        raise AssertionError("a Myro-initiated run must never touch the wallet")

    async def fake_dispatch(**kwargs: Any):
        captured.update(kwargs)
        return _fake_ticket(**kwargs)

    monkeypatch.setattr(_dispatch, "cannot_run", lambda: False)
    monkeypatch.setattr("app.services.job_refresh._xp_charge.charge", fake_charge)
    monkeypatch.setattr("app.services.job_refresh._dispatch.dispatch", fake_dispatch)

    ticket = asyncio.run(JobRefresh.start("user-1", repo, date(2026, 6, 1)))  # type: ignore[arg-type]

    assert ticket.xp_charged == 0
    assert captured["xp_charged"] == 0
    # None = "wallet untouched"; the client only reconciles a non-null balance.
    assert captured["new_coin_balance"] is None


def test_rq_connection_is_binary_state_connection_is_decoded(monkeypatch) -> None:
    """Regression: RQ pickles job payloads, so its Redis connection MUST be
    binary. A decoded (decode_responses=True) RQ connection crashes the worker
    with UnicodeDecodeError on dequeue → no worker → every refresh is refused.
    App JSON state stays on a decoded connection."""
    from app.services.job_refresh import _redis_state

    monkeypatch.setattr(_redis_state.settings, "redis_url", "redis://localhost:6379/0")

    rq = _redis_state._rq_connection()
    state = _redis_state._connection()

    assert rq.connection_pool.connection_kwargs.get("decode_responses") in (None, False)
    assert state.connection_pool.connection_kwargs.get("decode_responses") is True
