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


class UnregisteredJobTypeError(Exception):
    """The consuming process has no handler for a job it was handed.

    Always a deployment/import defect, never user data: the enqueuing process
    accepted the job (its own registry had the handler), so a drop here means
    the two processes disagree. Raising sends it to RQ's failed registry and
    fires the terminal-failure handler (refund), instead of the old behaviour —
    log-and-return, which RQ reported as "Job OK" and left the user waiting on
    work nothing would ever do.
    """


def registered_job_types() -> frozenset[str]:
    """Job types this process can actually run. Used by the Runner's boot log."""
    return frozenset(_HANDLERS)


def _is_durable() -> bool:
    return bool(settings.redis_url.strip())


def can_requeue() -> bool:
    """True when abandoned work can be re-run from the queue's own payload.

    Only the durable path keeps enqueued args; the in-process fallback runs the
    handler and forgets it. Callers check this BEFORE taking any claim, so an
    environment that can never requeue does not pay for pretending it might.
    """
    return _is_durable()


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
        # Queue availability and worker availability are deliberately separate.
        # Redis is the durable intake seam: a worker outage must accumulate work
        # for later delivery, never demote it to a web-process create_task.
        _enqueue_rq(lane, job_type, payload, correlation_id)
    else:
        # In-process fallback — preserves pre-ADR-0008 behaviour where no Redis
        # exists. No retry available here, so handlers refund-and-return on fail.
        _invoke_inline(job_type, payload)


def requeue_abandoned(lane: str, job_type: str, correlation_id: str) -> bool:
    """Put an abandoned job back on its lane, reusing the payload RQ still holds.

    A worker killed mid-job (a deploy, an OOM) leaves its work undone but NOT
    lost: RQ keeps the enqueued args in Redis under the job id, so the expensive
    inputs — for a CV upload, the extracted text — can be re-run without asking
    the user for anything again.

    RQ's own abandonment path does this, but only after `job_timeout` (15 min)
    has elapsed, because that is what makes a started job "expired". Callers who
    can tell sooner — a lease that stopped being renewed — use this to recover in
    seconds instead.

    Returns False when there is nothing to requeue: no Redis, no surviving job
    record (its TTL passed), or the job already reached a terminal state. Callers
    fall back to failing the job, so a False here must never be read as "handled".
    """
    if not _is_durable():
        return False
    try:
        from redis import Redis
        from rq import Queue
        from rq.exceptions import NoSuchJobError
        from rq.job import Job

        conn = Redis.from_url(settings.redis_url.strip())
        job_id = f"{job_type}:{correlation_id}"
        try:
            job = Job.fetch(job_id, connection=conn)
        except NoSuchJobError:
            _log.warning(
                "metric background.requeue_no_record job_type=%s id=%s",
                job_type, correlation_id,
            )
            return False
        if job.is_finished or job.is_canceled:
            return False
        Queue(lane, connection=conn).enqueue_job(job)
        _log.warning(
            "metric background.requeued_abandoned job_type=%s id=%s lane=%s",
            job_type, correlation_id, lane,
        )
        return True
    except Exception as exc:  # noqa: BLE001 — caller falls back to failing the job
        _log.warning(
            "metric background.requeue_failed job_type=%s id=%s exc=%s",
            job_type, correlation_id, exc.__class__.__name__,
        )
        return False


def _invoke_inline(job_type: str, payload: dict[str, Any]) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_invoke(job_type, payload, allow_retry=False))
        return
    loop.create_task(_invoke(job_type, payload, allow_retry=False))


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
        _log.error(
            "metric background.unregistered_job_type job_type=%s known=%s",
            job_type,
            ",".join(sorted(_HANDLERS)) or "none",
        )
        raise UnregisteredJobTypeError(job_type)
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
        # RQ calls this for two distinct causes: a retry ladder that ran out, and
        # a job it declared abandoned because the worker running it disappeared
        # (`AbandonedJobError`, raised by StartedJobRegistry.cleanup). Only the
        # first says anything about the provider. Pass the distinction through so
        # handlers can tell the user which one happened.
        payload = {
            **payload,
            "_abandoned": getattr(exc_type, "__name__", "") == "AbandonedJobError",
        }
        asyncio.run(fn(payload))
    except Exception:  # pragma: no cover — backstop must never crash the worker
        _log.exception("on_failure handler crashed for job=%s", getattr(job, "id", "?"))
