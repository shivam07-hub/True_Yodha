"""Dead-man for the Notice closer.

The closer is the only thing that sends the digest. After the quiet rule, a
day with no mail is the normal case, so a closer that never started looks
like a healthy product until the following Monday — and Monday uses the same
scheduler. The run writes `notice_closer_heartbeat` whether or not it sends.
This check lives on `/health` because a dead closer cannot report itself.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import get_supabase_admin

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class CloserHealth:
    state: str  # ok | stalled | unknown
    stale_hours: float | None


@dataclass
class _CachedCheck:
    at: datetime
    state: str
    stale_hours: float | None


_cache: _CachedCheck | None = None


def _age_hours(raw: object, now: datetime) -> float | None:
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return round((now - stamp).total_seconds() / 3600, 2)


def check_closer(now: datetime | None = None) -> CloserHealth:
    """Closer liveness, at most one DB read per configured interval."""
    global _cache
    now = now or datetime.now(timezone.utc)
    interval = timedelta(minutes=settings.notice_closer_health_interval_minutes)
    if _cache is not None and now - _cache.at < interval:
        return CloserHealth(_cache.state, _cache.stale_hours)

    health = _evaluate(now)
    _cache = _CachedCheck(at=now, state=health.state, stale_hours=health.stale_hours)
    return health


def _evaluate(now: datetime) -> CloserHealth:
    try:
        res = (
            get_supabase_admin()
            .table("notice_closer_heartbeat")
            .select("ran_at")
            .limit(1)
            .execute()
        )
    except Exception:  # noqa: BLE001 — a health probe must never raise
        log.warning("metric notice_closer.heartbeat_read_failed", exc_info=True)
        return CloserHealth("unknown", None)

    rows = res.data or []
    if not rows:
        # The table is new, or the closer has not completed a run since it
        # shipped. Absence is not yet a stall.
        return CloserHealth("unknown", None)

    stale_hours = _age_hours(rows[0].get("ran_at"), now)
    if stale_hours is None:
        return CloserHealth("unknown", None)
    if stale_hours >= settings.notice_closer_stale_hours:
        log.warning(
            "metric notice_closer.alert reason=dead_man stale_hours=%.2f threshold_hours=%d",
            stale_hours,
            settings.notice_closer_stale_hours,
        )
        from app.notice import Sighting, observe

        observe(Sighting.dead_man(belt="notice_closer"))
        return CloserHealth("stalled", stale_hours)
    return CloserHealth("ok", stale_hours)


def reset_cache() -> None:
    """Test seam — drops the throttle window."""
    global _cache
    _cache = None
