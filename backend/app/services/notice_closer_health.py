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
from app.services.probe import BeltState, _age_hours, remember, reset_cache as _reset

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class CloserHealth:
    state: BeltState  # ok | stalled | unknown
    stale_hours: float | None


def check_closer(now: datetime | None = None) -> CloserHealth:
    """Closer liveness, at most one DB read per configured interval.

    Returns a state and writes nothing. Opening the Notice is `probe.open_notice`.
    """
    now = now or datetime.now(timezone.utc)
    interval = timedelta(minutes=settings.notice_closer_health_interval_minutes)
    return remember("notice_closer", now, interval, lambda: _evaluate(now))


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
        return CloserHealth("stalled", stale_hours)
    return CloserHealth("ok", stale_hours)


def reset_cache() -> None:
    """Test seam — drops the throttle window."""
    _reset("notice_closer")
