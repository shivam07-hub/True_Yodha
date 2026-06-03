"""Provider Budget (ADR-0008) — global ceiling on concurrent LLM calls + a
classifier for transient-vs-permanent provider failures.

The budget is the single key-rack at the provider's door: a caller must take a
slot before invoking the provider and returns it after. Total in-flight LLM
calls stay bounded regardless of how many callers fan out, so a load spike can
never trip the provider rate limit.

Today the ceiling is a per-process `asyncio.Semaphore` — correct because the web
process is the only LLM caller. When Job Runners (separate processes) come online
the same `provider_slot()` seam swaps to a Redis token bucket without touching any
call site. See ADR-0008 → Provider Budget.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from openai import (
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    RateLimitError,
)

from app.config import settings

_log = logging.getLogger(__name__)

# Lazily built so tests can monkeypatch settings.llm_max_concurrency before first use.
_semaphore: asyncio.Semaphore | None = None
_semaphore_size: int = 0


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore, _semaphore_size
    size = max(1, int(settings.llm_max_concurrency))
    if _semaphore is None or _semaphore_size != size:
        _semaphore = asyncio.Semaphore(size)
        _semaphore_size = size
    return _semaphore


# ── Global Redis Provider Budget (ADR-0008) ─────────────────────────────────────
# Across many processes (web replicas + Job Runners) an asyncio.Semaphore is
# per-process — total in-flight = processes × size, which over-admits and trips
# 429s. The global cap is a leased semaphore in Redis: a ZSET of live slots keyed
# by a random member with score = lease expiry. Acquire is one atomic Lua step
# (drop expired → admit if under limit). A crashed holder's slot auto-frees when
# its lease expires, so the budget can never deadlock. Backpressure (poll-wait),
# never rejection — ADR-0008 Overload Policy.
_BUDGET_KEY = "llm:budget:slots"
# Max seconds a single slot may be held. Generous — longer than any real LLM
# call (CV parse, 4096 tokens) so we don't free a slot mid-call, short enough
# that a crashed holder recovers quickly.
_LEASE_TTL_SECONDS = 180.0
_POLL_INTERVAL_SECONDS = 0.05
# Log (don't fail) when a caller has waited this long for a slot — overload signal.
_WAIT_WARN_SECONDS = 10.0

# Lua: drop expired leases, admit (ZADD) iff live count < limit. Atomic → no
# two callers can both pass the check. Returns 1 admitted, 0 full.
_ACQUIRE_LUA = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
  return 1
end
return 0
"""

_async_redis: Any = None


def _get_async_redis() -> Any:
    global _async_redis
    if _async_redis is None:
        from redis.asyncio import Redis

        _async_redis = Redis.from_url(settings.redis_url.strip(), decode_responses=True)
    return _async_redis


@asynccontextmanager
async def _redis_slot() -> AsyncIterator[None]:
    redis = _get_async_redis()
    member = uuid.uuid4().hex
    limit = max(1, int(settings.llm_max_concurrency))
    started = time.monotonic()
    warned = False
    while True:
        now = time.time()
        admitted = await redis.eval(
            _ACQUIRE_LUA, 1, _BUDGET_KEY, str(now), str(now + _LEASE_TTL_SECONDS), str(limit), member
        )
        if admitted:
            break
        waited = time.monotonic() - started
        if waited >= _WAIT_WARN_SECONDS and not warned:
            warned = True
            _log.warning("metric llm.budget.wait member=%s waited=%.1fs limit=%d", member, waited, limit)
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
    try:
        yield
    finally:
        try:
            await redis.zrem(_BUDGET_KEY, member)
        except Exception:  # pragma: no cover — lease TTL frees the slot anyway
            _log.warning("llm.budget release failed for member=%s; lease will expire it", member)


@asynccontextmanager
async def provider_slot() -> AsyncIterator[None]:
    """Hold one global LLM slot for the duration of a provider call.

    Excess concurrent callers wait here rather than stampeding the provider —
    backpressure, not failure (ADR-0008 Overload Policy: slow under load, never
    429-dead).

    Global across processes via Redis when REDIS_URL is set (web replicas +
    Job Runners share one ceiling); falls back to a per-process asyncio.Semaphore
    locally / in tests (single process → identical behaviour).
    """
    if settings.redis_url.strip():
        async with _redis_slot():
            yield
        return
    sem = _get_semaphore()
    await sem.acquire()
    try:
        yield
    finally:
        sem.release()


# ── Failure classification (ADR-0008 retry policy) ──────────────────────────────

# Transient = retrying the SAME provider can succeed (rate limit, timeout,
# upstream 5xx, dropped connection). Permanent-for-this-model = a different
# provider might still work, but retrying this one will not (bad request, auth,
# content filter, empty response). Hard provider errors that are neither remain
# treated as "move to next provider" by the caller.
_TRANSIENT = (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError)


def is_transient(exc: BaseException) -> bool:
    """True if retrying the same provider entry could plausibly succeed."""
    return isinstance(exc, _TRANSIENT)


def retry_after_seconds(exc: BaseException) -> float | None:
    """Extract a server-advised Retry-After (seconds) from a RateLimitError, if present."""
    resp = getattr(exc, "response", None)
    if resp is None:
        return None
    headers = getattr(resp, "headers", None) or {}
    raw = headers.get("retry-after") or headers.get("Retry-After")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def backoff_delay(attempt: int, advised: float | None = None) -> float:
    """Exponential backoff with a server-advised override, clamped to config bounds.

    attempt is 0-based: 0 → base, 1 → base*2, 2 → base*4, …
    A server `Retry-After` always wins when larger than our computed delay.
    """
    base = float(settings.llm_retry_base_seconds)
    cap = float(settings.llm_retry_max_seconds)
    computed = min(cap, base * (2 ** max(0, attempt)))
    if advised is not None:
        return min(cap, max(computed, advised))
    return computed
