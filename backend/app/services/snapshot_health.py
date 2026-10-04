"""Dead-man for the Tier-0 snapshot refreshes.

Every refresh writes its own outcome to `snapshot_refresh_state`, and that was
the trouble. On 2026-10-03 `role_families` had last succeeded on 09-07, and
`skill_closeness` and `company_pulse` never had: 52, 38 and 36 failed attempts,
each error written to a row nobody read. Direction and the company pages served
weeks-old snapshots for 26 days and no instrument said so.

A refresh that keeps failing cannot report its own staleness, so the check lives
in the API process (always up), on /health beside the other belts, and in the
daily closer's harvest. Stale is `snapshot_refresh.is_stale` — the rule the
status route already applies. A task that has never succeeded is stalled: an
unstarted refresh and a dead one look the same to a user reading its table.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import get_supabase_admin
from app.services.probe import BeltState, remember, reset_cache as _reset
from app.services.snapshot_refresh import is_stale

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SnapshotHealth:
    state: BeltState  # ok | stalled | unknown
    tasks: dict[str, BeltState] = field(default_factory=dict)  # task -> ok | stalled

    @property
    def stalled(self) -> list[str]:
        return sorted(task for task, state in self.tasks.items() if state == "stalled")


def check_snapshots(now: datetime | None = None) -> SnapshotHealth:
    """Every snapshot task's state, at most one DB read per configured interval.

    Returns states and writes nothing. Opening the Notices is `probe.open_notice`
    with `probe.snapshot_belt(task)`.
    """
    now = now or datetime.now(timezone.utc)
    interval = timedelta(minutes=settings.snapshot_health_interval_minutes)
    return remember("snapshots", now, interval, lambda: _evaluate(now))


def _evaluate(now: datetime) -> SnapshotHealth:
    try:
        res = (
            get_supabase_admin()
            .table("snapshot_refresh_state")
            .select("task,last_success_at")
            .execute()
        )
    except Exception:  # noqa: BLE001 — a health probe must never raise
        log.warning("metric snapshot_refresh.state_read_failed", exc_info=True)
        return SnapshotHealth("unknown")

    tasks: dict[str, BeltState] = {}
    for row in res.data or []:
        task = str(row.get("task") or "")
        if not task:
            continue
        if is_stale(row.get("last_success_at"), now):
            log.warning(
                "metric snapshot_refresh.alert reason=dead_man task=%s last_success_at=%s",
                task,
                row.get("last_success_at"),
            )
            tasks[task] = "stalled"
        else:
            tasks[task] = "ok"
    if not tasks:
        return SnapshotHealth("unknown")
    state: BeltState = "stalled" if "stalled" in tasks.values() else "ok"
    return SnapshotHealth(state, tasks)


def reset_cache() -> None:
    """Test seam — drops the throttle window."""
    _reset("snapshots")
