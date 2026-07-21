"""Dead-man check for the listing-verification belt.

The belt stopped verifying on ~2026-07-17 and nobody noticed for four days,
because the only signals were metrics emitted BY the sweep — and a dead sweep
emits nothing. Absence of a signal is exactly what needs alerting, so the check
lives in the API process (always up) and reads the heartbeat the sweep leaves in
the database.

Deliberately cheap: throttled to one DB read per interval regardless of how
often /health is polled, and every failure degrades to "unknown" rather than
flipping a false alarm.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import get_supabase_admin

log = logging.getLogger(__name__)


@dataclass
class _CachedCheck:
    at: datetime
    state: str
    stale_hours: float | None


_cache: _CachedCheck | None = None


@dataclass(frozen=True)
class BeltHealth:
    state: str  # ok | stalled | unknown
    stale_hours: float | None


def _evaluate(now: datetime) -> BeltHealth:
    try:
        res = get_supabase_admin().rpc("verifier_last_attempt", {}).execute()
    except Exception:  # noqa: BLE001 — a health probe must never raise
        log.warning("metric job_verifier.heartbeat_read_failed", exc_info=True)
        return BeltHealth("unknown", None)

    raw = res.data
    if not raw:
        # Nothing ever claimed. Real on a fresh corpus, and still worth saying
        # out loud — an unstarted belt and a dead one look identical to a user.
        log.warning("metric job_verifier.alert reason=never_ran")
        return BeltHealth("stalled", None)

    try:
        last = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return BeltHealth("unknown", None)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    stale_hours = round((now - last).total_seconds() / 3600, 2)
    if stale_hours > settings.verifier_dead_man_hours:
        log.warning(
            "metric job_verifier.alert reason=dead_man stale_hours=%.2f threshold_hours=%d",
            stale_hours, settings.verifier_dead_man_hours,
        )
        return BeltHealth("stalled", stale_hours)
    return BeltHealth("ok", stale_hours)


def check_belt(now: datetime | None = None) -> BeltHealth:
    """Belt health, at most one DB read per configured interval."""
    global _cache
    now = now or datetime.now(timezone.utc)
    interval = timedelta(minutes=settings.verifier_health_interval_minutes)
    if _cache is not None and now - _cache.at < interval:
        return BeltHealth(_cache.state, _cache.stale_hours)

    health = _evaluate(now)
    _cache = _CachedCheck(at=now, state=health.state, stale_hours=health.stale_hours)
    return health


def reset_cache() -> None:
    """Test seam — drops the throttle window."""
    global _cache
    _cache = None
