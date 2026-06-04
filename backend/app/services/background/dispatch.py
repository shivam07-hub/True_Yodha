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

# job_type → async terminal-failure handler taking (payload). Runs once, on the
# RQ path only, after retries are exhausted — the instant-refund seam so a
# stranded job doesn't wait for the orphan-sweep watchman (ADR-0008 Upload
# Guarantee). Optional per job_type; must be idempotent (sweep may also run).
FailureHandler = Callable[[dict[str, Any]], Awaitable[None]]
_FAILURE_HANDLERS: dict[str, FailureHandler] = {}


def handler(job_type: str) -> Callable[[Handler], Handler]:
    """Register an async handler for a job_type."""
    def _register(fn: Handler) -> Handler:
        _HANDLERS[job_type] = fn
        return fn
    return _register


def failure_handler(job_type: str) -> Callable[[FailureHandler], FailureHandler]:
    """Register a terminal-failure handler (instant refund on RQ-retry exhaustion)."""
    def _register(fn: FailureHandler) -> FailureHandler:
        _FAILURE_HANDLERS[job_type] = fn
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
        if _has_active_worker_for_lane(lane):
            _enqueue_rq(lane, job_type, payload, correlation_id)
        else:
            # REDIS_URL is set but no Job Runner is draining this lane — the
            # durable rail is effectively off. Run inline so the user is never
            # dropped (Upload Guarantee), but emit a structured alarm: in prod a
            # missing worker must page, not silently degrade to in-process work.
            _log.critical(
                "metric worker.absent lane=%s job_type=%s env=%s action=ran_inline",
                lane,
                job_type,
                settings.railway_environment,
            )
            _invoke_inline(job_type, payload)
    else:
        # In-process fallback — preserves pre-ADR-0008 behaviour where no Redis
        # exists. No retry available here, so handlers refund-and-return on fail.
        _invoke_inline(job_type, payload)


def _invoke_inline(job_type: str, payload: dict[str, Any]) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_invoke(job_type, payload, allow_retry=False))
        return
    loop.create_task(_invoke(job_type, payload, allow_retry=False))


def _has_active_worker_for_lane(lane: str) -> bool:
    try:
        from redis import Redis
        from rq import Worker

        # RQ needs a binary connection (pickled payloads); a decoded one crashes
        # the worker on dequeue. See job_refresh._redis_state._rq_connection.
        conn = Redis.from_url(settings.redis_url.strip())
        workers = Worker.all(connection=conn)
        for worker in workers:
            queue_names = worker.queue_names()
            if lane in queue_names:
                return True
        return False
    except Exception as exc:
        _log.error(
            "Background worker liveness check failed for lane=%s: %s",
            lane,
            exc,
        )
        return False


def _enqueue_rq(
    lane: str, job_type: str, payload: dict[str, Any], correlation_id: str | None
) -> None:
    from redis import Redis
    from rq import Queue, Retry

    # RQ needs a binary connection (pickled payloads) — never decode_responses.
    conn = Redis.from_url(settings.redis_url.strip())
    queue = Queue(lane, connection=conn)
    kwargs: dict[str, Any] = dict(
        job_timeout=_JOB_TIMEOUT,
        result_ttl=3600,
        failure_ttl=24 * 3600,
        retry=Retry(max=_RETRY_MAX, interval=_RETRY_INTERVALS),
        on_failure=run_failure_sync,  # instant refund once retries exhaust
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
    exhaust, RQ moves the job to the failed registry and fires `run_failure_sync`
    (instant refund); the orphan-sweep watchman remains the independent backstop.
    """
    asyncio.run(_invoke(job_type, payload, allow_retry=True))


def run_failure_sync(job: Any, connection: Any, exc_type: Any, exc_value: Any, tb: Any) -> None:
    """RQ on_failure callback — fires once, after retries are exhausted.

    Extracts (job_type, payload) from the RQ job args and runs the registered
    terminal-failure handler so the charge is refunded immediately instead of
    waiting for the orphan-sweep. Idempotent: refund RPC short-circuits a
    second refund, so an overlapping sweep is harmless. Never raises — a failing
    failure-handler must not crash the worker; the sweep still backstops.
    """
    try:
        args = list(getattr(job, "args", []) or [])
        if len(args) < 2:
            return
        job_type, payload = args[0], args[1]
        fn = _FAILURE_HANDLERS.get(job_type)
        if fn is None:
            return
        asyncio.run(fn(payload))
    except Exception:  # pragma: no cover — backstop must never crash the worker
        _log.exception("on_failure handler crashed for job=%s", getattr(job, "id", "?"))
