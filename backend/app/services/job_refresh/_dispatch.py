"""Inline vs Redis dispatch. Hidden from callers behind the JobRefresh facade.

Both paths produce the same `RefreshState` shape via the same `_state` keys —
the polling endpoint never needs to know which path ran.

Production (Railway): REDIS_URL set → enqueue on RQ queue, worker runs pipeline.
If Redis is set and no Job Runner is alive, refuse (503) — never inline the
Match Run on the API event loop. That path blocked the progress stream and
looked like a hung first step.
Local / tests: REDIS_URL empty → execute pipeline inline on the event loop and
seed the state synchronously.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from dataclasses import asdict
from datetime import date
from typing import Any

from fastapi import HTTPException, status

from app.config import settings
from app.services.job_refresh import _pipeline, _xp_charge
from app.services.job_refresh import _failure
from app.services.job_refresh.types import (
    PROGRESS_LABELS,
    QUEUED_STRANDED_SECONDS,
    SEARCH_RETRYING,
    SEARCH_UNAVAILABLE,
    RefreshLifecycle,
    RefreshOutcomeKind,
    RefreshState,
    RefreshTicket,
)

_log = logging.getLogger(__name__)

# In-process state for inline dispatch (tests + local dev).
_inline_state: dict[str, dict[str, Any]] = {}
_inline_live: dict[str, str] = {}
_inline_lock = threading.Lock()

_LIVE_STATES = frozenset({"queued", "computing"})


def _ticket_id() -> str:
    return uuid.uuid4().hex


def _redis_key(user_id: str, ticket_id: str) -> str:
    return f"job_refresh:ticket:{user_id}:{ticket_id}"


def _live_key(user_id: str) -> str:
    return f"job_refresh:live:{user_id}"


def _is_async_mode() -> bool:
    return bool(settings.redis_url.strip())


def cannot_run() -> bool:
    """True when this process would have to inline a Redis-mode Match Run.

    Redis configured + no Job Runner = the API loop would block on ranking,
    and the user would stare at 'Waiting to start' with no stream. Refuse.
    """
    return _is_async_mode() and not _has_active_refresh_worker()


def _has_active_refresh_worker() -> bool:
    try:
        from rq import Worker

        from app.services.job_refresh._redis_state import get_redis_connection, queue_name

        target = queue_name()
        workers = Worker.all(connection=get_redis_connection())
        return any(target in worker.queue_names() for worker in workers)
    except Exception as exc:
        _log.error("Refresh worker liveness check failed: %s", exc)
        return False


def _enqueue_refresh_rq(
    *,
    user_id: str,
    ticket_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    xp_charged: int,
) -> str:
    from app.services.job_refresh._redis_state import enqueue_pipeline

    return enqueue_pipeline(
        user_id=user_id,
        ticket_id=ticket_id,
        batch_week=batch_week,
        excluded_job_ids=excluded_job_ids,
        xp_charged=xp_charged,
    )


# ── State persistence ──────────────────────────────────────────────────

def _write_state(user_id: str, state: RefreshState) -> None:
    payload = asdict(state)
    payload["batch_week"] = str(state.batch_week)
    if _is_async_mode():
        # Lazy import — local dev doesn't need redis installed.
        from app.services.job_refresh._redis_state import set_state

        set_state(_redis_key(user_id, state.ticket_id), payload)
        _sync_live(user_id, state)
    else:
        with _inline_lock:
            _inline_state[f"{user_id}:{state.ticket_id}"] = payload
        _sync_live(user_id, state)


def read_state(user_id: str, ticket_id: str) -> RefreshState | None:
    if _is_async_mode():
        from app.services.job_refresh._redis_state import get_state

        raw = get_state(_redis_key(user_id, ticket_id))
    else:
        with _inline_lock:
            raw = _inline_state.get(f"{user_id}:{ticket_id}")
    if not raw:
        return None
    bw = raw.get("batch_week")
    if isinstance(bw, str):
        bw_parsed = date.fromisoformat(bw)
    else:
        bw_parsed = bw
    return RefreshState(
        ticket_id=raw["ticket_id"],
        state=raw["state"],
        progress_label=raw["progress_label"],
        batch_week=bw_parsed,
        matches_written=raw.get("matches_written"),
        refund=raw.get("refund"),
        new_coin_balance=raw.get("new_coin_balance"),
        outcome_kind=raw.get("outcome_kind"),
        error=raw.get("error"),
        debug=raw.get("debug") or {},
        progress_done=raw.get("progress_done"),
        progress_total=raw.get("progress_total"),
        revealed=raw.get("revealed") or [],
        xp_charged=int(raw.get("xp_charged") or 0),
    )


def _sync_live(user_id: str, state: RefreshState) -> None:
    """One live ticket per user. Only that ticket may clear the index."""
    live = state.state in _LIVE_STATES
    if _is_async_mode():
        from app.services.job_refresh._redis_state import delete_state, get_state, set_state

        key = _live_key(user_id)
        if live:
            set_state(key, {"ticket_id": state.ticket_id, "state": state.state})
            return
        current = get_state(key)
        if current and current.get("ticket_id") == state.ticket_id:
            delete_state(key)
        return
    with _inline_lock:
        if live:
            _inline_live[user_id] = state.ticket_id
        elif _inline_live.get(user_id) == state.ticket_id:
            _inline_live.pop(user_id, None)


def user_has_live_refresh(user_id: str) -> bool:
    """True while this user has a queued or computing Match Run.

    Feed-warm and other judgment callers shed against this so ranking keeps
    the LLM slots. Unreadable index fails open (warm may run) — a down
    Redis is not a reason to skip the feed forever.
    """
    try:
        if _is_async_mode():
            from app.services.job_refresh._redis_state import get_state

            raw = get_state(_live_key(user_id))
            return bool(raw and raw.get("ticket_id"))
        with _inline_lock:
            return user_id in _inline_live
    except Exception:
        _log.warning("live-refresh index unreadable user=%s", user_id, exc_info=True)
        return False


def _state(
    ticket_id: str,
    lifecycle: RefreshLifecycle,
    batch_week: date,
    *,
    matches_written: int | None = None,
    refund: int | None = None,
    new_coin_balance: int | None = None,
    outcome_kind: RefreshOutcomeKind | None = None,
    error: str | None = None,
    debug: dict[str, Any] | None = None,
    progress_done: int | None = None,
    progress_total: int | None = None,
    revealed: list[dict[str, Any]] | None = None,
    xp_charged: int = 0,
    progress_label: str | None = None,
) -> RefreshState:
    return RefreshState(
        ticket_id=ticket_id,
        state=lifecycle,
        progress_label=progress_label or PROGRESS_LABELS[lifecycle],
        batch_week=batch_week,
        matches_written=matches_written,
        refund=refund,
        new_coin_balance=new_coin_balance,
        outcome_kind=outcome_kind,
        error=error,
        debug=debug or {},
        progress_done=progress_done,
        progress_total=progress_total,
        revealed=revealed or [],
        xp_charged=xp_charged,
    )


def _make_progress_cb(user_id: str, ticket_id: str, batch_week: date):
    """Per-job reveal callback for the ranker. Each call writes a fresh
    `computing` snapshot carrying the cumulative revealed list — the SSE relay
    tails this and streams `progress` events (ADR-0009 per-job reveal)."""
    revealed: list[dict[str, Any]] = []

    def _cb(done: int, total: int, job: dict[str, Any]) -> None:
        revealed.append({"title": job.get("title"), "company": job.get("company")})
        _write_state(
            user_id,
            _state(
                ticket_id, "computing", batch_week,
                progress_done=done, progress_total=total, revealed=list(revealed),
            ),
        )

    return _cb


# ── Pipeline ───────────────────────────────────────────────────────────

async def _run_pipeline(
    user_id: str,
    ticket_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    xp_charged: int,
) -> RefreshState:
    """One paid ticket, one retry. The exception never becomes the user message."""
    _write_state(user_id, _state(ticket_id, "computing", batch_week))
    last_exc: BaseException | None = None
    for attempt in (1, 2):
        if attempt == 2:
            _log.warning("metric job_refresh.retry user=%s ticket=%s", user_id, ticket_id)
            _write_state(
                user_id,
                _state(ticket_id, "computing", batch_week, progress_label=SEARCH_RETRYING),
            )
        try:
            outcome = await _pipeline.run(
                user_id, batch_week, excluded_job_ids,
                on_progress=_make_progress_cb(user_id, ticket_id, batch_week),
            )
            return await _finish_success(user_id, ticket_id, batch_week, xp_charged, outcome)
        except Exception as exc:
            last_exc = exc
            _failure.record(exc, user_id=user_id, ticket_id=ticket_id, attempt=attempt)
    assert last_exc is not None
    _, message = _failure.classify(last_exc)
    new_balance = await _xp_charge.refund(user_id, xp_charged)
    final = _state(
        ticket_id,
        "failed",
        batch_week,
        refund=xp_charged,
        new_coin_balance=new_balance,
        error=message,
        xp_charged=xp_charged,
    )
    _write_state(user_id, final)
    return final


async def _finish_success(
    user_id: str,
    ticket_id: str,
    batch_week: date,
    xp_charged: int,
    outcome: Any,
) -> RefreshState:
    if not outcome.should_charge_xp and xp_charged > 0:
        refunded_balance = await _xp_charge.refund(user_id, xp_charged)
        final = _state(
            ticket_id,
            "done",
            batch_week,
            matches_written=outcome.matches_written,
            refund=xp_charged,
            new_coin_balance=refunded_balance,
            outcome_kind=outcome.kind,
            debug=outcome.debug,
        )
    else:
        final = _state(
            ticket_id,
            "done",
            batch_week,
            matches_written=outcome.matches_written,
            outcome_kind=outcome.kind,
            debug=outcome.debug,
        )
    _write_state(user_id, final)
    return final


async def _run_inline(
    user_id: str,
    ticket_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    xp_charged: int,
) -> RefreshState:
    """Run pipeline on the event loop (tests + local)."""
    return await _run_pipeline(user_id, ticket_id, batch_week, excluded_job_ids, xp_charged)


# ── Public dispatch ────────────────────────────────────────────────────

async def dispatch(
    user_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    xp_charged: int,
    new_coin_balance: int | None,
) -> RefreshTicket:
    """Create a ticket, kick off compute, return queued state.

    `new_coin_balance` is None when the refresh was free (no charge) — the client
    only reconciles the wallet when it's non-null.
    """
    if cannot_run():
        await _refuse_without_runner(user_id, xp_charged)

    tid = _ticket_id()
    queued = _state(tid, "queued", batch_week, xp_charged=xp_charged)
    _write_state(user_id, queued)

    if _is_async_mode():
        try:
            _enqueue_refresh_rq(
                user_id=user_id,
                ticket_id=tid,
                batch_week=batch_week,
                excluded_job_ids=excluded_job_ids,
                xp_charged=xp_charged,
            )
        except Exception:
            _log.exception("Enqueue failed user=%s ticket=%s", user_id, tid)
            new_balance = await _xp_charge.refund(user_id, xp_charged)
            failed = _state(
                tid,
                "failed",
                batch_week,
                refund=xp_charged,
                new_coin_balance=new_balance,
                error="Failed to queue compute.",
                xp_charged=xp_charged,
            )
            _write_state(user_id, failed)
            return RefreshTicket(
                id=tid,
                state="done",
                xp_charged=0,
                new_coin_balance=new_balance if new_balance is not None else new_coin_balance,
                batch_week=batch_week,
                progress_label=PROGRESS_LABELS["failed"],
            )
    else:
        # Inline: schedule on event loop, don't block POST.
        asyncio.create_task(
            _run_inline(user_id, tid, batch_week, excluded_job_ids, xp_charged)
        )

    return RefreshTicket(
        id=tid,
        state="queued",
        xp_charged=xp_charged,
        new_coin_balance=new_coin_balance,
        batch_week=batch_week,
        progress_label=PROGRESS_LABELS["queued"],
    )


async def _refuse_without_runner(user_id: str, xp_charged: int) -> None:
    """Refund (if charged) and raise. Does not write a ticket — nothing started."""
    _log.critical("No active job-refresh worker; refusing rather than inlining")
    await _xp_charge.refund(user_id, xp_charged)
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=SEARCH_UNAVAILABLE)


def _cancel_queued_job(user_id: str, ticket_id: str) -> None:
    if not _is_async_mode():
        return
    from app.services.job_refresh._redis_state import cancel_pipeline

    cancel_pipeline(user_id, ticket_id)


async def abandon_stranded(
    user_id: str,
    ticket_id: str,
    queued_for: float,
) -> RefreshState | None:
    """Fail a ticket that is still queued after the runner disappeared.

    A live runner (even a busy one) is a wait, not a failure. A ticket the
    runner already picked up is left alone — writing `failed` over `computing`
    would refund a search that is about to land.
    """
    if not _is_async_mode() or queued_for < QUEUED_STRANDED_SECONDS:
        return None
    if _has_active_refresh_worker():
        return None
    _cancel_queued_job(user_id, ticket_id)
    state = read_state(user_id, ticket_id)
    if state is None or state.state != "queued":
        return None
    new_balance = await _xp_charge.refund(user_id, state.xp_charged)
    failed = _state(
        ticket_id,
        "failed",
        state.batch_week,
        refund=state.xp_charged,
        new_coin_balance=new_balance,
        error=SEARCH_UNAVAILABLE,
        xp_charged=state.xp_charged,
    )
    _write_state(user_id, failed)
    _log.error(
        "Abandoned stranded refresh user=%s ticket=%s queued_for=%.1fs",
        user_id, ticket_id, queued_for,
    )
    return failed


def run_pipeline_worker(
    user_id: str,
    ticket_id: str,
    batch_week_iso: str,
    excluded_job_ids: list[str],
    xp_charged: int,
) -> dict[str, Any]:
    """Entry point invoked by the RQ worker process. Must be picklable + sync.

    Same ticket, same retry, same named failure as the inline path.
    """
    batch_week = date.fromisoformat(batch_week_iso)
    final = asyncio.run(
        _run_pipeline(user_id, ticket_id, batch_week, excluded_job_ids, xp_charged)
    )
    return _serialize(final)


def _serialize(state: RefreshState) -> dict[str, Any]:
    payload = asdict(state)
    payload["batch_week"] = str(state.batch_week)
    return payload


def clear_inline_state() -> None:
    """Test helper. Clears the in-process state store between tests."""
    with _inline_lock:
        _inline_state.clear()
        _inline_live.clear()
