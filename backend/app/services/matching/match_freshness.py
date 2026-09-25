"""Match Freshness — has a Match Run landed for the direction this user holds NOW?

Two timestamps on `user_profiles` answer it, and until this module nothing read
them together:

  `target_updated_at`   stamped by `targeting_write.commit` on a real direction
                        change (`repositories/users.py` `_direction_changed`).
  `last_match_run_at`   stamped by `match_run.run_match` alone, and only for a
                        run that actually searched a direction.

Migration `20260804_target_updated_at.sql` wrote the contract down —
`last_match_run_at >= target_updated_at` means the matches reflect this
direction, otherwise a run is outstanding — and `04ef9f3b` deleted the reader
and its self-heal. Since then `target_updated_at` has been written on every
direction change and compared against nothing, so a Direction save whose run
never landed was indistinguishable from one that finished: the surface asked
`compute_match_health`, which answers "does any match row exist", and the
`/market` warmer writes rows of its own. Ten warmer rows made a dead run read
as `vetted`. Measured 2026-09-25: 331 profiles hold a direction newer than
their last run, 4 of the 14 saved in the preceding week.

**This module decides nothing about jobs.** It compares two timestamps and
names the state. The repair lives in `forward_pass.finish_outstanding_match`,
on the door the cohort already walks.

**Invariants**

- **`unknown` is a state, and it is the one legacy rows get.** A profile with a
  direction but no `target_updated_at` predates the column; we cannot tell
  whether its run landed. Reading that as `outstanding` would enqueue a run for
  every dormant account at once — a backfill wearing a forward pass's clothes.
  Absence is not a verdict.
- **`running` is not `outstanding`.** A Direction save enqueues its run on the
  spot, and the run is long: `target_updated_at → last_match_run_at` measured
  166s for a real signup and 190–220s for most (CONTEXT.md "Provisional
  Match"). Inside `RUN_GRACE_SECONDS` a run is in flight, not missing, so
  nothing re-enqueues and no surface may cry failure.
- **Naive timestamps are read as UTC**, the tz every writer on both columns
  stamps in; a stored value without an offset must not make the comparison
  throw on the read path someone is waiting on.
- The module is the test surface (`test_match_freshness.py`): the states are
  tested once here, not re-derived by each consumer.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

Freshness = Literal["no_direction", "unknown", "covered", "running", "outstanding"]

#: How long a just-saved direction is allowed to have no run before the run is
#: treated as missing rather than in flight. Comfortably past the measured
#: 166–220s compute, so a slow run is never mistaken for a dead one.
RUN_GRACE_SECONDS = 15 * 60

__all__ = ["Freshness", "RUN_GRACE_SECONDS", "state", "is_outstanding"]


def _parse(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _has_direction(profile: dict[str, Any]) -> bool:
    titles = profile.get("target_role_titles")
    if isinstance(titles, list) and any(str(t).strip() for t in titles):
        return True
    return bool(str(profile.get("target_role_title") or "").strip())


def state(profile: dict[str, Any], *, now: datetime | None = None) -> Freshness:
    """Name the state of this profile's match coverage.

    `no_direction` — nothing to match against; the Direction step owns this.
    `unknown`      — a direction with no change stamp (pre-`20260804` rows).
    `covered`      — a run landed at or after the current direction.
    `running`      — the direction changed within `RUN_GRACE_SECONDS`.
    `outstanding`  — the direction changed, the grace is past, no run landed.
    """
    if not _has_direction(profile):
        return "no_direction"

    changed = _parse(profile.get("target_updated_at"))
    if changed is None:
        return "unknown"

    ran = _parse(profile.get("last_match_run_at"))
    if ran is not None and ran >= changed:
        return "covered"

    moment = now or datetime.now(timezone.utc)
    if (moment - changed).total_seconds() < RUN_GRACE_SECONDS:
        return "running"
    return "outstanding"


def is_outstanding(profile: dict[str, Any], *, now: datetime | None = None) -> bool:
    """The one question the forward pass asks: is a run owed to this user?"""
    return state(profile, now=now) == "outstanding"
