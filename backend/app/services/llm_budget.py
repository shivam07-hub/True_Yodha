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
from contextlib import asynccontextmanager
from typing import AsyncIterator

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


@asynccontextmanager
async def provider_slot() -> AsyncIterator[None]:
    """Hold one global LLM slot for the duration of a provider call.

    Excess concurrent callers wait here rather than stampeding the provider —
    backpressure, not failure. This is the ADR-0008 Overload Policy at the
    provider door: slow under load, never 429-dead.
    """
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
