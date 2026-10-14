"""Is this person on Myro right now?

Background judging spends only while the person it is for is here (Shivam,
2026-10-14). The drain used to feed itself batch after batch once anything
started it: of 501 drain ticks on 2026-10-13, 500 were self-continuations, one
was a person opening /market, and one new signup's first drain ran 222 ticks.
The OpenRouter balance ran out that evening.

The shell reads `/users/me` on every authed page; that read marks the person
present for `PRESENT_SECONDS`. A drain asks before it queues its next batch and
pauses when they have gone — where it stopped is simply the next visit's pile.

Shared Redis, so the worker sees marks written by both APIs. When we cannot
tell — Redis unreachable — the person reads as absent: this rule exists to stop
spend, so not knowing means not spending. Marking is fail-soft the other way:
it rides the read every page waits on and must never break it.
"""
from __future__ import annotations

import logging
import time

from app.config import settings

logger = logging.getLogger(__name__)

#: How long one page counts as being here. Long enough to read a list and come
#: back to it; short enough that a closed tab stops spending within minutes.
PRESENT_SECONDS = 15 * 60

# user id → monotonic expiry. Only used when Redis is absent (local dev, tests).
_LOCAL: dict[str, float] = {}


def _key(user_id: str) -> str:
    return f"present:{user_id}"


def mark(user_id: str) -> None:
    url = settings.redis_url.strip()
    if not url:
        _LOCAL[user_id] = time.monotonic() + PRESENT_SECONDS
        return
    try:
        from redis import Redis

        Redis.from_url(url, decode_responses=True).set(_key(user_id), "1", ex=PRESENT_SECONDS)
    except Exception as exc:  # noqa: BLE001 — presence must never break the page that marks it
        logger.warning("metric presence.mark_unavailable exc=%s", exc.__class__.__name__)


def is_present(user_id: str) -> bool:
    url = settings.redis_url.strip()
    if not url:
        return _LOCAL.get(user_id, 0.0) > time.monotonic()
    try:
        from redis import Redis

        return bool(Redis.from_url(url, decode_responses=True).exists(_key(user_id)))
    except Exception as exc:  # noqa: BLE001 — unknown reads as absent: no spend
        logger.warning("metric presence.read_unavailable exc=%s", exc.__class__.__name__)
        return False
