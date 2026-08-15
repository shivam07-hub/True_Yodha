"""Per-IP ceilings for anonymous, unauthenticated actions.

One limiter, one table of ceilings. It was private to `routers/public.py` until
the partner consent screen needed the same protection; two copies of a limiter
means two tables of ceilings that drift, and the second one is always the one
nobody remembers to tune.

In-memory and therefore per-PROCESS: this is a courtesy ceiling on abuse of free
work, not an authentication control. The credential-bearing surfaces use the
Redis-backed limiters in `auth_rate_limit` and `partner_auth`, which hold across
processes and fail closed in production.
"""
from __future__ import annotations

import time
from collections import deque

from fastapi import HTTPException, status

WINDOW_SECONDS = 3600.0

MAX_PER_WINDOW = {
    "score": 5,
    "rewrite": 6,
    "restructure": 2,
    "job_search": 12,
    "download_event": 10,
    "export": 10,
    # The consent screen. Reading context is cheap and a user may reload it;
    # asking us to send mail is not, so it is held much tighter.
    "partner_connect_context": 30,
    "partner_connect_email": 3,
}

# Short burst windows on top of the hourly ceiling. The hourly limit alone let a
# single tab hammer rewrite/score for a minute (landing playground loops) and
# saturate the shared LLM lane before the hour bucket filled.
BURST_LIMITS: dict[str, tuple[float, int]] = {
    "score": (60.0, 2),
    "rewrite": (60.0, 3),
    "restructure": (60.0, 1),
}

MESSAGES = {
    "score": "You've previewed a few CVs already. Sign up to keep scoring.",
    "rewrite": "You've polished a lot of bullets. Sign up to keep improving your CV.",
    "restructure": "You've restructured this CV a couple of times. Sign up to keep going.",
    "job_search": "You've run a lot of searches. Sign up to save jobs and see your fit.",
    "export": "You've downloaded a few CVs already. Sign up to save and keep working.",
    "partner_connect_context": "Too many attempts. Wait a moment and reload.",
    "partner_connect_email": "We've already sent a link. Check your inbox, including spam.",
}

_hits: dict[tuple[str, str], deque[float]] = {}
_burst_hits: dict[tuple[str, str], deque[float]] = {}


def enforce_anon_rate(action: str, ip: str) -> None:
    """Raise 429 when `ip` has exceeded this action's hourly or burst ceiling."""
    now = time.monotonic()
    burst = BURST_LIMITS.get(action)
    if burst is not None:
        window, limit = burst
        burst_hits = _burst_hits.setdefault((action, ip), deque())
        while burst_hits and now - burst_hits[0] > window:
            burst_hits.popleft()
        if len(burst_hits) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=MESSAGES.get(action, "Too many requests. Sign up to keep going."),
            )
        burst_hits.append(now)

    limit = MAX_PER_WINDOW.get(action, 5)
    hits = _hits.setdefault((action, ip), deque())
    while hits and now - hits[0] > WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=MESSAGES.get(action, "Too many requests. Sign up to keep going."),
        )
    hits.append(now)


def reset() -> None:
    """Drop every counter. For tests — the window is an hour, so a suite that
    shares a process would otherwise leak one test's hits into the next."""
    _hits.clear()
    _burst_hits.clear()
