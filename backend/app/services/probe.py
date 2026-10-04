"""One dead-man probe. A read returns a state. Opening a Notice is a separate act.

Three belts used to each carry a copy of the age maths, a cache, a reset
seam, and an `_emit` that wrote a Notice from inside the function a caller
used to ask a question. `notice/closer.py` asked for a string and opened
the same Notice the harvest then opened again.

The belt name and which states open a Notice live on the declaration.
`check` does not write.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, TypeVar, cast

BeltState = Literal["ok", "degraded", "stalled", "unknown"]

T = TypeVar("T")


@dataclass(frozen=True)
class Declaration:
    belt: str
    opens_on: frozenset[BeltState]


INGESTION = Declaration("job_ingestion", frozenset({"stalled"}))
VERIFIER = Declaration("listing_verifier", frozenset({"stalled", "degraded"}))
CLOSER = Declaration("notice_closer", frozenset({"stalled"}))

#: One belt per Tier-0 snapshot task — the rows of `snapshot_refresh_state`,
#: held to that table's check constraint by `test_snapshot_health`. Each task is
#: its own Notice, so the digest names which snapshot went stale and each closes
#: on its own recovery.
SNAPSHOT_TASKS = (
    "analytics",
    "company_directory",
    "company_pulse",
    "ghost_index",
    "job_search",
    "role_families",
    "sector_panel",
    "skill_closeness",
    "skill_demand",
)
SNAPSHOTS = {
    task: Declaration(f"snapshot.{task}", frozenset({"stalled"}))
    for task in SNAPSHOT_TASKS
}


def snapshot_belt(task: str) -> Declaration:
    """A task's belt. One the declarations do not name still opens — as
    `dead_man:unknown`, which is loud, never silent."""
    return SNAPSHOTS.get(task) or Declaration(f"snapshot.{task}", frozenset({"stalled"}))


__all__ = [
    "CLOSER",
    "INGESTION",
    "SNAPSHOTS",
    "SNAPSHOT_TASKS",
    "VERIFIER",
    "BeltState",
    "Declaration",
    "age_seconds",
    "open_notice",
    "remember",
    "reset_cache",
    "snapshot_belt",
]


def _instant(raw: object) -> datetime | None:
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp


def _age_hours(raw: object, now: datetime) -> float | None:
    stamp = _instant(raw)
    if stamp is None:
        return None
    return round((now - stamp).total_seconds() / 3600, 2)


def age_seconds(raw: object, now: datetime) -> float | None:
    stamp = _instant(raw)
    if stamp is None:
        return None
    return (now - stamp).total_seconds()


@dataclass
class _Slot:
    at: datetime
    value: object


_slots: dict[str, _Slot] = {}


def remember(
    key: str,
    now: datetime,
    interval: timedelta,
    compute: Callable[[], T],
) -> T:
    """The last answer for `key`, recomputed once `interval` has passed."""
    slot = _slots.get(key)
    if slot is not None and now - slot.at < interval:
        return cast(T, slot.value)
    value = compute()
    _slots[key] = _Slot(at=now, value=value)
    return value


def reset_cache(key: str | None = None) -> None:
    if key is None:
        _slots.clear()
        return
    _slots.pop(key, None)


def open_notice(declaration: Declaration, state: BeltState) -> None:
    """Open this belt's dead-man when `state` is one the declaration names.

    Asking for the state does not call this. A caller that wants the Notice
    calls it.
    """
    if state not in declaration.opens_on:
        return
    from app.notice import Sighting, observe

    observe(Sighting.dead_man(belt=declaration.belt))
