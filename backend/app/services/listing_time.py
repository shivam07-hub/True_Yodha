"""Time on a listing — four questions, one verdict.

Readers used to subtract `now − last_seen` and believe they were measuring
re-observation. `last_seen` has never moved on any row, so that subtraction
was discovery age. This module is the only place that answers the four
questions, converts a YYYYMMDD marker, or names how long a confirmation
stays sayable. It does no I/O and reads no clock.

| Question | Column | On the verdict |
|---|---|---|
| When did Myro receive this row? | `ingested_at` | `received_at` |
| When did Myro last confirm it is open? | `last_verified_live_at` | `confirmed_at` |
| What day did the crawler discover it? | `first_seen` | `discovered_on` |
| When did the crawler last see it? | `last_seen` | not answered — retired |

`last_seen` is read only to recognise the 2026-07-11 copy: a
`last_verified_live_at` whose UTC date equals that marker was never a
check. The column is not a time this module returns.

**Invariants**

- The caller passes `now`. A verdict for the same row and the same instant
  is the same verdict.
- Three states, never a boolean: `confirmed_open`, `unconfirmed`, `closed`.
  Unparseable, absent, seeded, and never-checked are `unconfirmed`. Absence
  is not a confirmation.
- Bad input does not raise and does not pass through as a date.
- One clock: UTC. A naive instant is UTC. An aware instant is converted.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, Mapping

State = Literal["confirmed_open", "unconfirmed", "closed"]

#: How long a genuine confirmation still means the listing is open. Past it
#: the state is `unconfirmed`, not a quieter `confirmed_open`. Seven days is
#: the window the verifier already re-checks on; the old 21- and 45-day
#: figures were ages of `last_seen` and are not part of this set.
CONFIRM_WITHIN = timedelta(days=7)

__all__ = ["CONFIRM_WITHIN", "ListingTime", "State", "verdict"]


@dataclass(frozen=True)
class ListingTime:
    """One row's answers. `confirmed_at` is None when the stamp is missing,
    unparseable, or the 2026-07-11 copy of `last_seen`."""

    state: State
    received_at: datetime | None
    confirmed_at: datetime | None
    discovered_on: date | None
    #: When a verifier opened the page (`last_conclusive_verification_at`).
    #: Distinct from `confirmed_at`: a close stamps this and does not stamp
    #: `last_verified_live_at`. None when absent or unparseable.
    checked_at: datetime | None = None


def verdict(row: Mapping[str, Any], *, now: datetime) -> ListingTime:
    """Name whether this listing is confirmed open, closed, or unconfirmed.

    `now` is required. This function does not read a clock.
    """
    if not isinstance(row, Mapping):
        return ListingTime("unconfirmed", None, None, None, None)

    received_at = _instant(row.get("ingested_at"))
    discovered_on = _calendar_day(row.get("first_seen"))
    checked_at = _instant(row.get("last_conclusive_verification_at"))
    stamp = _instant(row.get("last_verified_live_at"))
    confirmed_at = None
    if stamp is not None and not _is_seeded(stamp, row.get("last_seen")):
        confirmed_at = stamp

    moment = _as_utc(now)
    if _is_closed(row):
        state: State = "closed"
    elif (
        confirmed_at is not None
        and moment is not None
        and confirmed_at >= moment - CONFIRM_WITHIN
    ):
        state = "confirmed_open"
    else:
        state = "unconfirmed"
    return ListingTime(state, received_at, confirmed_at, discovered_on, checked_at)


def _is_closed(row: Mapping[str, Any]) -> bool:
    """A close the verifier wrote. A missing flag is not a close."""
    if row.get("is_active") is False:
        return True
    return row.get("listing_confidence") == "closed"


def _is_seeded(stamp: datetime, last_seen: Any) -> bool:
    """True when the stamp's UTC date is the crawler's discovery marker.

    That is the shape `20260711_trusted_job_lifecycle.sql` wrote, and the
    shape `20260927100000_deseed_false_verification_stamps.sql` nulled.
    A check that lands on the same UTC date as discovery is indistinguishable
    from that copy and is not treated as a confirmation.
    """
    seen = _calendar_day(last_seen)
    if seen is None:
        return False
    return stamp.date() == seen


def _as_utc(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _instant(value: Any) -> datetime | None:
    """A timestamptz cell → UTC. Unparseable → None. Never raises."""
    if isinstance(value, datetime):
        return _as_utc(value)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        day = _calendar_day(text)
        if day is None:
            return None
        return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    converted = _as_utc(parsed)
    return converted


def _calendar_day(value: Any) -> date | None:
    """A YYYYMMDD marker or an ISO date → a calendar day.

    Unparseable → None. The raw text is never returned: a string that is
    not a day is not a day.
    """
    if isinstance(value, datetime):
        converted = _as_utc(value)
        return None if converted is None else converted.date()
    if isinstance(value, date):
        return value
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        text = f"{value:08d}" if 0 <= value <= 99_999_999 else ""
    elif isinstance(value, str):
        text = value.strip()
    else:
        return None
    if len(text) == 8 and text.isdigit():
        try:
            return date(int(text[0:4]), int(text[4:6]), int(text[6:8]))
        except ValueError:
            return None
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None
    return None
