"""Background-work dispatch: lanes, handler registry, enqueue, runner entrypoint.

A **Background Job** is an async handler registered under a `job_type` string and
run on a **Work Lane** (`fast` or `bulk`). The same handler runs whether the job
was enqueued onto RQ (durable, prod) or executed in-process (no Redis). Handlers
must be idempotent on their correlation key — RQ delivers at-least-once.

Retry policy (ADR-0008): a handler raises `TransientJobError` (or any exception)
to signal "retry me" — only reachable on the RQ path, where RQ retries with
backoff. A handler that returns normally is terminal, even if it internally
recorded a failure+refund (the permanent-failure path). On the in-process path
there is no retry, so handlers refund-and-return on every failure there.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

from app.config import settings

_log = logging.getLogger(__name__)

LANE_FAST = "fast"   # a user is waiting on a loading screen
LANE_BULK = "bulk"   # nobody is watching

_LANES = (LANE_FAST, LANE_BULK)

# RQ retry ladder (ADR-0008 Q3): 3 retries, growing pauses.
_RETRY_INTERVALS = [5, 15, 45]
_RETRY_MAX = len(_RETRY_INTERVALS)
_JOB_TIMEOUT = 15 * 60  # SIGKILL/stuck protection — moves to failed registry → refund


class TransientJobError(Exception):
    """Raised by a handler to request a retry (RQ path only)."""


# job_type → async handler taking (payload, allow_retry)
Handler = Callable[[dict[str, Any], bool], Awaitable[None]]
_HANDLERS: dict[str, Handler] = {}


def handler(job_type: str) -> Callable[[Handler], Handler]:
    """Register an async handler for a job_type."""
    def _register(fn: Handler) -> Handler:
        _HANDLERS[job_type] = fn
        return fn
    return _register


def _is_durable() -> bool:
    return bool(settings.redis_url.strip())


def enqueue(
    lane: str,
    job_type: str,
    *,
    payload: dict[str, Any],
    correlation_id: str | None = None,
) -> None:
    """Defer a Background Job. Durable via RQ when REDIS_URL is set, else in-process.

    `correlation_id` becomes the RQ job id (idempotent enqueue) when provided.
    """
    if lane not in _LANES:
        raise ValueError(f"unknown Work Lane: {lane!r}")
    if job_type not in _HANDLERS:
        raise ValueError(f"no handler registered for job_type {job_type!r}")

    if _is_durable():
        _enqueue_rq(lane, job_type, payload, correlation_id)
    else:
        # In-process fallback — preserves pre-ADR-0008 behaviour where no Redis
        # exists. No retry available here, so handlers refund-and-return on fail.
        asyncio.create_task(_invoke(job_type, payload, allow_retry=False))


def _enqueue_rq(
    lane: str, job_type: str, payload: dict[str, Any], correlation_id: str | None
) -> None:
    from redis import Redis
    from rq import Queue, Retry

    conn = Redis.from_url(settings.redis_url.strip(), decode_responses=True)
    queue = Queue(lane, connection=conn)
    kwargs: dict[str, Any] = dict(
        job_timeout=_JOB_TIMEOUT,
        result_ttl=3600,
        failure_ttl=24 * 3600,
        retry=Retry(max=_RETRY_MAX, interval=_RETRY_INTERVALS),
    )
    if correlation_id:
        kwargs["job_id"] = f"{job_type}:{correlation_id}"
    queue.enqueue("app.services.background.dispatch.run_job_sync", job_type, payload, **kwargs)


async def _invoke(job_type: str, payload: dict[str, Any], *, allow_retry: bool) -> None:
    fn = _HANDLERS.get(job_type)
    if fn is None:
        _log.error("Background job %s has no handler — dropping", job_type)
        return
    try:
        await fn(payload, allow_retry)
    except TransientJobError:
        raise  # RQ path: signal retry
    except Exception:
        _log.exception("Background job %s crashed (allow_retry=%s)", job_type, allow_retry)
        if allow_retry:
            raise  # let RQ retry on the durable path
        # in-process: nothing retries us; handler is responsible for refund


def run_job_sync(job_type: str, payload: dict[str, Any]) -> None:
    """RQ worker entrypoint. Bridges RQ's sync call into the async handler.

    Raising propagates to RQ → triggers its retry/backoff ladder. After retries
    exhaust, RQ moves the job to the failed registry; the orphan-sweep watchman
    is the independent backstop that refunds anything left stranded.
    """
    asyncio.run(_invoke(job_type, payload, allow_retry=True))
