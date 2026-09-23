"""Dead-man check for job ingestion — the belt that refills the corpus.

The listing verifier has had one of these since July. Ingestion never did, and
on 2026-09-18 that cost nine days: the last `job_source_runs` row was
2026-09-09, one job was ingested in the nine days after it, and 2,715 were
retired in six. The verifier was healthy the whole time — 31,380 checks on the
16th — so every instrument we had reported a working system busily retiring
listings that nothing was replacing. It surfaced only because someone audited
one user's matches by hand.

Same shape as `verifier_health`, for the same reason: a stopped belt cannot
report its own absence, so the check lives in the API process (always up) and
reads the heartbeat the scraper leaves behind.

**The heartbeat is `job_source_runs.started_at`, never `jobs.ingested_at`.**
The extension writes `ingested_at` when a user saves a job, and exactly that
happened during the outage — one saved job on the 17th. A single user saving a
LinkedIn post must not make a dead scraper look alive. Only the scraper writes
`job_source_runs`.

Two thresholds, because the promise and the bar are different numbers today:
`degraded` at 72h is the cadence we are aiming for, and it only shows on
/health. `stalled` at 168h is the loose bar compute can hold right now, and it
is the only one that opens a Notice. Both are env-tunable so tightening toward
72h is a config change, not a deploy.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import get_supabase_admin

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class IngestionHealth:
    state: str  # ok | degraded | stalled | unknown
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


def _emit(health: IngestionHealth) -> IngestionHealth:
    """Open the Notice. `stalled` only — `degraded` is the 72h target we are
    knowingly behind, and a row that is always open teaches people to skip the
    digest. `observe` never mails (ADR-0021); the daily digest is the one send.
    """
    from app.notice import Sighting, observe

    observe(Sighting.dead_man(belt="job_ingestion"))
    return health


def _evaluate(now: datetime) -> IngestionHealth:
    try:
        res = (
            get_supabase_admin()
            .table("job_source_runs")
            .select("started_at")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception:  # noqa: BLE001 — a health probe must never raise
        log.warning("metric job_ingestion.heartbeat_read_failed", exc_info=True)
        return IngestionHealth("unknown", None)

    rows = res.data or []
    if not rows:
        # Nothing has ever ingested. True on a fresh database, and still worth
        # saying out loud: an unstarted belt and a dead one look identical to a
        # user staring at a corpus that never grows.
        log.warning("metric job_ingestion.alert reason=never_ran")
        return _emit(IngestionHealth("stalled", None))

    stale_hours = _age_hours(rows[0].get("started_at"), now)
    if stale_hours is None:
        return IngestionHealth("unknown", None)
    if stale_hours >= settings.ingestion_stalled_hours:
        log.warning(
            "metric job_ingestion.alert reason=dead_man stale_hours=%.2f threshold_hours=%d",
            stale_hours, settings.ingestion_stalled_hours,
        )
        return _emit(IngestionHealth("stalled", stale_hours))
    if stale_hours >= settings.ingestion_degraded_hours:
        # Visible, deliberately quiet. The target is 72h; compute cannot hold it
        # yet, and paging on a known constraint teaches people to ignore pages.
        log.warning(
            "metric job_ingestion.behind stale_hours=%.2f target_hours=%d",
            stale_hours, settings.ingestion_degraded_hours,
        )
        return IngestionHealth("degraded", stale_hours)
    return IngestionHealth("ok", stale_hours)


def check_ingestion(now: datetime | None = None) -> IngestionHealth:
    """Ingestion health, at most one DB read per configured interval."""
    global _cache
    now = now or datetime.now(timezone.utc)
    interval = timedelta(minutes=settings.ingestion_health_interval_minutes)
    if _cache is not None and now - _cache.at < interval:
        return IngestionHealth(_cache.state, _cache.stale_hours)

    health = _evaluate(now)
    _cache = _CachedCheck(at=now, state=health.state, stale_hours=health.stale_hours)
    return health


def reset_cache() -> None:
    """Test seam — drops the throttle window."""
    global _cache
    _cache = None
