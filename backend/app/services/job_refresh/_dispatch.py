"""Inline vs Redis dispatch. Hidden from callers behind the JobRefresh facade.

Both paths produce the same `RefreshState` shape via the same `_state` keys —
the polling endpoint never needs to know which path ran.

Production (Railway): REDIS_URL set → enqueue on RQ queue, worker runs pipeline.
Local / tests: REDIS_URL empty → execute pipeline inline on the event loop and
seed the state synchronously.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import uuid
from dataclasses import asdict
from datetime import date, datetime, timezone
from typing import Any

from app.config import settings
from app.services.job_refresh import _pipeline, _xp_charge
from app.services.job_refresh.types import (
    PROGRESS_LABELS,
    RefreshLifecycle,
    RefreshOutcomeKind,
    RefreshState,
    RefreshTicket,
)

_log = logging.getLogger(__name__)

# In-process state for inline dispatch (tests + local dev).
_inline_state: dict[str, dict[str, Any]] = {}
_inline_lock = threading.Lock()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ticket_id() -> str:
    return uuid.uuid4().hex


def _redis_key(user_id: str, ticket_id: str) -> str:
    return f"job_refresh:ticket:{user_id}:{ticket_id}"


def _is_async_mode() -> bool:
    return bool(settings.redis_url.strip())


# ── State persistence ──────────────────────────────────────────────────

def _write_state(user_id: str, state: RefreshState) -> None:
    payload = asdict(state)
    payload["batch_week"] = str(state.batch_week)
    if _is_async_mode():
        # Lazy import — local dev doesn't need redis installed.
        from app.services.job_refresh._redis_state import set_state

        set_state(_redis_key(user_id, state.ticket_id), payload)
    else:
        with _inline_lock:
            _inline_state[f"{user_id}:{state.ticket_id}"] = payload


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
        new_xp_balance=raw.get("new_xp_balance"),
        outcome_kind=raw.get("outcome_kind"),
        error=raw.get("error"),
        debug=raw.get("debug") or {},
    )


def _state(
    ticket_id: str,
    lifecycle: RefreshLifecycle,
    batch_week: date,
    *,
    matches_written: int | None = None,
    refund: int | None = None,
    new_xp_balance: int | None = None,
    outcome_kind: RefreshOutcomeKind | None = None,
    error: str | None = None,
    debug: dict[str, Any] | None = None,
) -> RefreshState:
    return RefreshState(
        ticket_id=ticket_id,
        state=lifecycle,
        progress_label=PROGRESS_LABELS[lifecycle],
        batch_week=batch_week,
        matches_written=matches_written,
        refund=refund,
        new_xp_balance=new_xp_balance,
        outcome_kind=outcome_kind,
        error=error,
        debug=debug or {},
    )


# ── Inline pipeline ────────────────────────────────────────────────────

async def _run_inline(
    user_id: str,
    ticket_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    xp_charged: int,
) -> RefreshState:
    """Run pipeline synchronously, update state, settle XP."""
    _write_state(user_id, _state(ticket_id, "computing", batch_week))
    try:
        outcome = await _pipeline.run(user_id, batch_week, excluded_job_ids)
    except Exception as exc:
        _log.exception("Inline job refresh failed user=%s ticket=%s", user_id, ticket_id)
        new_balance = await _xp_charge.refund(user_id, xp_charged)
        final = _state(
            ticket_id,
            "failed",
            batch_week,
            refund=xp_charged,
            new_xp_balance=new_balance,
            error=str(exc),
        )
        _write_state(user_id, final)
        return final

    if not outcome.should_charge_xp and xp_charged > 0:
        refunded_balance = await _xp_charge.refund(user_id, xp_charged)
        final = _state(
            ticket_id,
            "done",
            batch_week,
            matches_written=outcome.matches_written,
            refund=xp_charged,
            new_xp_balance=refunded_balance,
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


# ── Public dispatch ────────────────────────────────────────────────────

async def dispatch(
    user_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    xp_charged: int,
    new_xp_balance: int,
) -> RefreshTicket:
    """Create a ticket, kick off compute, return queued state."""
    tid = _ticket_id()
    queued = _state(tid, "queued", batch_week)
    _write_state(user_id, queued)

    if _is_async_mode():
        from app.services.job_refresh._redis_state import enqueue_pipeline

        try:
            enqueue_pipeline(
                user_id=user_id,
                ticket_id=tid,
                batch_week=batch_week,
                excluded_job_ids=excluded_job_ids,
                xp_charged=xp_charged,
            )
        except Exception as exc:
            _log.exception("Enqueue failed user=%s ticket=%s", user_id, tid)
            new_balance = await _xp_charge.refund(user_id, xp_charged)
            failed = _state(
                tid,
                "failed",
                batch_week,
                refund=xp_charged,
                new_xp_balance=new_balance,
                error="Failed to queue compute.",
            )
            _write_state(user_id, failed)
            return RefreshTicket(
                id=tid,
                state="done",
                xp_charged=0,
                new_xp_balance=new_balance if new_balance is not None else new_xp_balance,
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
        new_xp_balance=new_xp_balance,
        batch_week=batch_week,
        progress_label=PROGRESS_LABELS["queued"],
    )


def run_pipeline_worker(
    user_id: str,
    ticket_id: str,
    batch_week_iso: str,
    excluded_job_ids: list[str],
    xp_charged: int,
) -> dict[str, Any]:
    """Entry point invoked by the RQ worker process. Must be picklable + sync.

    Mirrors `_run_inline` but lives in a separate process. State writes go
    through the same Redis-backed `_write_state` path the API reads from.
    """
    batch_week = date.fromisoformat(batch_week_iso)
    _write_state(user_id, _state(ticket_id, "computing", batch_week))
    try:
        outcome = asyncio.run(
            _pipeline.run(user_id, batch_week, excluded_job_ids)
        )
    except Exception as exc:
        _log.exception("Async job refresh failed user=%s ticket=%s", user_id, ticket_id)
        new_balance = asyncio.run(_xp_charge.refund(user_id, xp_charged))
        final = _state(
            ticket_id,
            "failed",
            batch_week,
            refund=xp_charged,
            new_xp_balance=new_balance,
            error=str(exc),
        )
        _write_state(user_id, final)
        return _serialize(final)

    if not outcome.should_charge_xp and xp_charged > 0:
        refunded_balance = asyncio.run(_xp_charge.refund(user_id, xp_charged))
        final = _state(
            ticket_id,
            "done",
            batch_week,
            matches_written=outcome.matches_written,
            refund=xp_charged,
            new_xp_balance=refunded_balance,
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
    return _serialize(final)


def _serialize(state: RefreshState) -> dict[str, Any]:
    payload = asdict(state)
    payload["batch_week"] = str(state.batch_week)
    return payload


def clear_inline_state() -> None:
    """Test helper. Clears the in-process state store between tests."""
    with _inline_lock:
        _inline_state.clear()
