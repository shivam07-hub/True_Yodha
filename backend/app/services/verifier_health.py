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
    productive_stale_hours: float | None
    priority_backlog: int | None


_cache: _CachedCheck | None = None


@dataclass(frozen=True)
class BeltHealth:
    state: str  # ok | degraded | stalled | unknown
    stale_hours: float | None
    productive_stale_hours: float | None = None
    priority_backlog: int | None = None


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


def _evaluate(now: datetime) -> BeltHealth:
    try:
        res = get_supabase_admin().rpc(
            "verifier_health_snapshot",
            {"p_priority_stale": f"{settings.verifier_priority_stale_hours} hours"},
        ).execute()
    except Exception:  # noqa: BLE001 — a health probe must never raise
        log.warning("metric job_verifier.heartbeat_read_failed", exc_info=True)
        return BeltHealth("unknown", None)

    snapshot = res.data
    if not isinstance(snapshot, dict):
        return BeltHealth("unknown", None)
    raw_attempt = snapshot.get("last_attempt")
    if not raw_attempt:
        # Nothing ever claimed. Real on a fresh corpus, and still worth saying
        # out loud — an unstarted belt and a dead one look identical to a user.
        log.warning("metric job_verifier.alert reason=never_ran")
        return BeltHealth("stalled", None)

    stale_hours = _age_hours(raw_attempt, now)
    productive_stale_hours = _age_hours(snapshot.get("last_productive"), now)
    try:
        priority_backlog = int(snapshot.get("priority_due"))
    except (TypeError, ValueError):
        priority_backlog = None
    if stale_hours is None:
        return BeltHealth("unknown", None)
    if stale_hours > settings.verifier_dead_man_hours:
        log.warning(
            "metric job_verifier.alert reason=dead_man stale_hours=%.2f threshold_hours=%d",
            stale_hours, settings.verifier_dead_man_hours,
        )
        return BeltHealth(
            "stalled", stale_hours, productive_stale_hours, priority_backlog
        )
    if (
        productive_stale_hours is None
        or productive_stale_hours > settings.verifier_dead_man_hours
    ):
        log.warning(
            "metric job_verifier.alert reason=no_recent_productive_verdict "
            "productive_stale_hours=%s threshold_hours=%d priority_backlog=%s",
            productive_stale_hours,
            settings.verifier_dead_man_hours,
            priority_backlog,
        )
        return BeltHealth(
            "degraded", stale_hours, productive_stale_hours, priority_backlog
        )
    return BeltHealth("ok", stale_hours, productive_stale_hours, priority_backlog)


def check_belt(now: datetime | None = None) -> BeltHealth:
    """Belt health, at most one DB read per configured interval."""
    global _cache
    now = now or datetime.now(timezone.utc)
    interval = timedelta(minutes=settings.verifier_health_interval_minutes)
    if _cache is not None and now - _cache.at < interval:
        return BeltHealth(
            _cache.state,
            _cache.stale_hours,
            _cache.productive_stale_hours,
            _cache.priority_backlog,
        )

    health = _evaluate(now)
    _cache = _CachedCheck(
        at=now,
        state=health.state,
        stale_hours=health.stale_hours,
        productive_stale_hours=health.productive_stale_hours,
        priority_backlog=health.priority_backlog,
    )
    return health


def reset_cache() -> None:
    """Test seam — drops the throttle window."""
    global _cache
    _cache = None
