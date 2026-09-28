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
from app.services.probe import BeltState, _age_hours, remember, reset_cache as _reset

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class BeltHealth:
    state: BeltState
    stale_hours: float | None
    productive_stale_hours: float | None = None
    priority_backlog: int | None = None


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
    raw_sweep = snapshot.get("last_sweep")
    if not raw_attempt and not raw_sweep:
        # Nothing ever ran. Real on a fresh corpus, and still worth saying
        # out loud — an unstarted belt and a dead one look identical to a user.
        log.warning("metric job_verifier.alert reason=never_ran")
        return BeltHealth("stalled", None)

    # Liveness is the newest evidence that a sweep ran. The sweep heartbeat is
    # stamped even when nothing is due; a claim only when rows were. On
    # 2026-09-28 every schedule row had been attempted inside the 7-day window,
    # so claims stood still while the cron ran every 15 minutes, and idle read
    # as dead. A claim still counts: it happens inside a sweep.
    claim_hours = _age_hours(raw_attempt, now)
    sweep_hours = _age_hours(raw_sweep, now)
    known = [h for h in (claim_hours, sweep_hours) if h is not None]
    stale_hours = min(known) if known else None
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
    # Degraded is work claimed and nothing concluded. With nothing claimed
    # recently there was no work to conclude — idle, which is healthy.
    claimed_recently = (
        claim_hours is not None and claim_hours <= settings.verifier_dead_man_hours
    )
    if claimed_recently and (
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
    """Belt health, at most one DB read per configured interval.

    Returns a state and writes nothing. Opening the Notice is `probe.open_notice`.
    """
    now = now or datetime.now(timezone.utc)
    interval = timedelta(minutes=settings.verifier_health_interval_minutes)
    return remember("verifier", now, interval, lambda: _evaluate(now))


def reset_cache() -> None:
    """Test seam — drops the throttle window."""
    _reset("verifier")
