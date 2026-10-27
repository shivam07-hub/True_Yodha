"""Listing Liveness — whether a listing is still up: live · uncertain · down.

CONTEXT.md → Listing Liveness. Read from two columns, `jobs.is_active`
(lifecycle) and `jobs.listing_confidence` (Listing Confidence). This is the
Python half; `public.listing_is_live(jobs)` is the SQL half and states the same
predicate (`SQL_PREDICATE`, held equal by test). Every reader asks here rather
than spelling the columns — measured 2026-10-27 the live rule was spelled at six
Python sites and the down rule at three, which split on `likely_closed`.

  live       `is_active` is true and `listing_confidence` is `active` — the only
             listings a person is shown or counted.
  down       `is_active` is false, or the confidence says closed. Either column
             is evidence on its own.
  uncertain  everything else. New listings land here until the verifier
             confirms them.

A row that did not select a column is a caller bug, and it is never read as
live: `listing_trust` once defaulted a missing column to active. It is not read
as down either — absence is not a close.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar

Liveness = Literal["live", "uncertain", "down"]

#: `listing_confidence` values that mean the ad is gone.
DOWN_CONFIDENCE = frozenset({"closed", "likely_closed"})

#: The body of `public.listing_is_live(jobs)`, and the predicate every partial
#: index on the live rule spells (an index cannot call a whole-row function).
SQL_PREDICATE = "is_active is true and listing_confidence = 'active'"

_Q = TypeVar("_Q")


def liveness(row: Mapping[str, Any]) -> Liveness:
    if not isinstance(row, Mapping):
        return "uncertain"
    active = row.get("is_active")
    confidence = row.get("listing_confidence")
    if active is False or confidence in DOWN_CONFIDENCE:
        return "down"
    if active is True and confidence == "active":
        return "live"
    return "uncertain"


def is_live(row: Mapping[str, Any]) -> bool:
    return liveness(row) == "live"


def is_down(row: Mapping[str, Any]) -> bool:
    return liveness(row) == "down"


def live_only(query: _Q) -> _Q:
    """Narrow a PostgREST `jobs` read to live listings.

    `is.true`, not `eq.true`: PostgREST sends `eq` as `is_active = true`, and
    Postgres cannot prove an index predicate of `is_active IS TRUE` from it.
    """
    return query.is_("is_active", "true").eq("listing_confidence", "active")  # type: ignore[attr-defined]
