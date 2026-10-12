"""Time on a listing — four questions, one verdict.

Readers used to subtract `now − last_seen` and believe they were measuring
re-observation. `last_seen` has never moved on any row, so that subtraction
was discovery age. This module is the only place that answers the four
questions, converts a YYYYMMDD marker, or names how long a confirmation
stays sayable. `ListingTime.card()` is how a verdict reads on a job card.
It does no I/O and reads no clock.

| Question | Column | On the verdict |
|---|---|---|
| When did Myro receive this row? | `ingested_at` | `received_at` |
| When did a verifier last open the page? | `last_conclusive_verification_at` | `checked_at` |
| When did Myro last confirm it is open? | that check, when it found the listing live | `confirmed_at` |
| What day did the crawler discover it? | `first_seen` | `discovered_on` |
| When did the crawler last see it? | `last_seen` | not answered — retired |

`last_verified_live_at` is not the answer to "confirmed". Two writers stamp
it: the verifier when it opened the page and found it live, and the crawler
when the job_id was in the employer's feed (myro-job-scraper
`lifecycle_writer.apply_seen`). A feed sighting is not a check
(`listing_trust`). The column is read only as a witness to which verdict the
last check reached; see `_found_live`.

**Invariants**

- The caller passes `now`. A verdict for the same row and the same instant
  is the same verdict.
- Three states, never a boolean: `confirmed_open`, `unconfirmed`, `closed`.
  Unparseable, absent, seeded, crawl-only and never-checked are
  `unconfirmed`. Absence is not a confirmation.
- `confirmed_at` is `checked_at` or None. A confirmation is a check that
  found the listing live; there is no confirmation without a check.
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

#: The retired crawler column. Nothing here reads it as a time; callers
#: that still sort or archive by discovery name it through this constant.
SEED_COLUMN = "last_seen"

#: The columns a row must carry for `ListingTime.card()` to be true. A
#: column left off a select is absent, and absence reads as `unconfirmed`,
#: silently, on every card that path builds.
CARD_COLUMNS = (
    "first_seen,is_active,listing_confidence,last_verified_live_at,"
    "last_conclusive_verification_at,reactivated_at"
)

__all__ = [
    "CARD_COLUMNS",
    "CONFIRM_WITHIN",
    "ListingTime",
    "SEED_COLUMN",
    "State",
    "day",
    "marker",
    "verdict",
]


@dataclass(frozen=True)
class ListingTime:
    """One row's answers. `confirmed_at` is None unless the verifier's last
    conclusive check found the listing live."""

    state: State
    received_at: datetime | None
    confirmed_at: datetime | None
    discovered_on: date | None
    #: When a verifier opened the page (`last_conclusive_verification_at`).
    #: Distinct from `confirmed_at`: a closed, redirected or wrong-role
    #: verdict stamps this too. None when absent or unparseable.
    checked_at: datetime | None = None

    def card(self) -> dict[str, Any]:
        """The three listing fields every job card carries, from this verdict.

        The only place a verdict becomes wire fields. A card that built them
        itself handed the raw YYYYMMDD integer to a string field and omitted
        `is_stale`, which then defaulted to "confirmed open".
        """
        return {
            "first_seen": None if self.discovered_on is None else self.discovered_on.isoformat(),
            "last_seen_at": None if self.confirmed_at is None else self.confirmed_at.date().isoformat(),
            "is_stale": self.state != "confirmed_open",
        }


def verdict(row: Mapping[str, Any], *, now: datetime) -> ListingTime:
    """Name whether this listing is confirmed open, closed, or unconfirmed.

    `now` is required. This function does not read a clock.
    """
    if not isinstance(row, Mapping):
        return ListingTime("unconfirmed", None, None, None, None)

    received_at = _instant(row.get("ingested_at"))
    discovered_on = _calendar_day(row.get("first_seen"))
    checked_at = _instant(row.get("last_conclusive_verification_at"))
    confirmed_at = checked_at if _found_live(row, checked_at) else None

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


def _found_live(row: Mapping[str, Any], checked_at: datetime | None) -> bool:
    """True when the verifier's last conclusive check found the listing live.

    The writers, by column (`repositories/job_listing_verification.record`,
    myro-job-scraper `lifecycle_writer.apply_seen`):

    | Write | `last_verified_live_at` | `last_conclusive_verification_at` | `reactivated_at` |
    |---|---|---|---|
    | verifier, live | T | T | T |
    | verifier, closed / redirected / wrong role | – | T | – |
    | crawler, feed sighting | T | – | T if it was not active |

    Only the verifier's live verdict stamps the conclusive clock in the same
    instant as either other column. `reactivated_at` is the witness that
    survives a later sighting: the crawler re-stamps `last_verified_live_at`
    on every live row it sees, and leaves `reactivated_at` alone on a row
    that is already active. A check followed by a sighting is still a check;
    a sighting that re-activated a closed listing is not one.

    The 2026-07-11 copy of `last_seen` cannot pass: that stamp was nulled
    (`20260927100000`), and the copy never wrote `reactivated_at`. The one
    pair that is not a check is `20260805b`'s one-shot copy of the live stamp
    into the conclusive clock; a row untouched since carries it, dated on or
    before 2026-08-05, so it is never inside `CONFIRM_WITHIN` again.
    """
    if checked_at is None:
        return False
    return checked_at in (
        _instant(row.get("last_verified_live_at")),
        _instant(row.get("reactivated_at")),
    )


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


def day(value: Any) -> date | None:
    """A YYYYMMDD marker or an ISO date, as a calendar day.

    The only conversion. Unparseable is None: not the raw text, not an
    exception.
    """
    return _calendar_day(value)


def marker(when: date) -> int:
    """The integer a discovery column stores for this calendar day.

    A query bound. This function does not read a clock.
    """
    return when.year * 10_000 + when.month * 100 + when.day
