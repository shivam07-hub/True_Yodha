"""One-per-window claims, so a self-heal on a polled read stays a heal.

A read that repairs itself has to answer "how often?" before it is safe. The
onboarding result endpoint is polled every 2 seconds while the score is missing;
re-enqueueing the score job on each poll would turn one stalled user into thirty
jobs a minute against a queue and a provider budget shared with production.

`claim(key, ttl)` returns True at most once per `ttl` for a given key, so the
caller can repair without measuring anything itself.

Redis-backed when Redis exists (all deployed tiers), so the window holds across
web replicas. Without Redis it degrades to a per-process dict, which is the
correct approximation for local dev — one process, so one window.

Fail-soft by construction: any Redis error returns False. A heal that does not
fire is a user who waits for the next poll; a `claim` that raises is a result
endpoint that 500s. The quiet failure is the right one here, and it is the only
place in this module where that is true.
"""

from __future__ import annotations

import logging
import time

from app.config import settings

logger = logging.getLogger(__name__)

# key → unix time the local window expires. Only used when Redis is absent.
_LOCAL_CLAIMS: dict[str, float] = {}


def _sweep_local(now: float) -> None:
    """Drop expired local claims so a long-lived process cannot grow this dict."""
    for key in [key for key, expiry in _LOCAL_CLAIMS.items() if expiry <= now]:
        _LOCAL_CLAIMS.pop(key, None)


def claim(key: str, ttl_seconds: int) -> bool:
    """True iff this caller won the window for `key`. False means someone else
    (another replica, or this one moments ago) already did the work."""
    url = settings.redis_url.strip()
    if not url:
        now = time.monotonic()
        _sweep_local(now)
        if _LOCAL_CLAIMS.get(key, 0.0) > now:
            return False
        _LOCAL_CLAIMS[key] = now + ttl_seconds
        return True

    try:
        from redis import Redis

        conn = Redis.from_url(url, decode_responses=True)
        return bool(conn.set(f"claim:{key}", "1", nx=True, ex=ttl_seconds))
    except Exception as exc:  # noqa: BLE001 — a claim must never break its caller
        logger.warning(
            "metric background.claim_unavailable key=%s exc=%s",
            key, exc.__class__.__name__,
        )
        return False


def release(key: str) -> None:
    """Drop a claim before its TTL runs out.

    ONLY for a claim held as a single-flight lock, where the TTL is a deadlock
    guard rather than the point. A debounce window must never be released —
    its whole purpose is to stay held for the full interval so the work does
    not repeat.

    Without this, a claim and the thing it guards can disagree: the guarded
    cache entry gets invalidated while the claim still has seconds to run, so
    every caller finds no cache AND cannot claim the fill, waits out the
    cold-fill poll, and then computes anyway — one coordinated stall followed
    by the exact stampede the claim exists to prevent.
    """
    url = settings.redis_url.strip()
    if not url:
        _LOCAL_CLAIMS.pop(key, None)
        return

    try:
        from redis import Redis

        Redis.from_url(url, decode_responses=True).delete(f"claim:{key}")
    except Exception as exc:  # noqa: BLE001 — a release must never break its caller
        logger.warning(
            "metric background.release_unavailable key=%s exc=%s",
            key, exc.__class__.__name__,
        )
