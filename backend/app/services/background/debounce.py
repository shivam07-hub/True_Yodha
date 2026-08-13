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
import secrets
import time

from app.config import settings

logger = logging.getLogger(__name__)

# key → unix time the local window expires. Only used when Redis is absent.
_LOCAL_CLAIMS: dict[str, float] = {}
_LOCAL_LEASES: dict[str, tuple[float, str]] = {}


def _sweep_local(now: float) -> None:
    """Drop expired local claims so a long-lived process cannot grow this dict."""
    for key in [key for key, expiry in _LOCAL_CLAIMS.items() if expiry <= now]:
        _LOCAL_CLAIMS.pop(key, None)


def _sweep_local_leases(now: float) -> None:
    for key in [key for key, (expiry, _token) in _LOCAL_LEASES.items() if expiry <= now]:
        _LOCAL_LEASES.pop(key, None)


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


def acquire_lease(key: str, ttl_seconds: int) -> str | None:
    """Acquire a releasable, owner-safe lease and return its opaque token."""
    token = secrets.token_urlsafe(24)
    url = settings.redis_url.strip()
    if not url:
        now = time.monotonic()
        _sweep_local_leases(now)
        current = _LOCAL_LEASES.get(key)
        if current is not None and current[0] > now:
            return None
        _LOCAL_LEASES[key] = (now + ttl_seconds, token)
        return token

    try:
        from redis import Redis

        conn = Redis.from_url(url, decode_responses=True)
        return token if conn.set(f"claim:{key}", token, nx=True, ex=ttl_seconds) else None
    except Exception as exc:  # noqa: BLE001 — a lease must never break its caller
        logger.warning(
            "metric background.lease_unavailable key=%s exc=%s",
            key, exc.__class__.__name__,
        )
        return None


def release_lease(key: str, token: str) -> None:
    """Release ``key`` only when ``token`` still owns it."""
    url = settings.redis_url.strip()
    if not url:
        current = _LOCAL_LEASES.get(key)
        if current is not None and secrets.compare_digest(current[1], token):
            _LOCAL_LEASES.pop(key, None)
        return

    try:
        from redis import Redis

        Redis.from_url(url, decode_responses=True).eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
            "return redis.call('del', KEYS[1]) else return 0 end",
            1,
            f"claim:{key}",
            token,
        )
    except Exception as exc:  # noqa: BLE001 — a release must never break its caller
        logger.warning(
            "metric background.lease_release_unavailable key=%s exc=%s",
            key, exc.__class__.__name__,
        )
