"""Which accounts are Myro's own — the one answer every population count asks.

Dev and prod share one database. The Match Quality personas have to walk the
real journey to be worth anything (sign in, upload a CV, choose a direction,
open Jobs), so they land in the real tables beside real people. Marked with
`user_profiles.is_test_account`, they stay real to the product and invisible to
every number we steer by.

ONE module, because four counters need the same answer and must never disagree:

  - `routers/public.py` `_count_seekers` — the seeker figure on the landing page
  - `scripts/loop_reach.py`             — the spine and every loop's reach
  - `ScoresRepository.get_all_band_scores` — the peers behind "top X% for {band}"
  - `routers/telemetry.py`              — the CV-upload phase funnel

A fifth counter that forgets to ask is the failure this module exists to
prevent, so `tests/test_test_accounts_excluded.py` asserts each of those four
still reads through here.

Counters that scope to ONE user (`.eq("user_id", …)`) never need this: a
persona's own reads are about the persona.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from app.db_safe import safe_read

logger = logging.getLogger(__name__)

__all__ = ["excluded_user_ids", "reset_cache"]

# Marking an account is deliberate and rare, so the set barely moves. The TTL is
# about not re-reading it inside one batch of counts, not about freshness.
_TTL_SECONDS = 300

# A guard, not a page size. If Myro ever holds more than this many of its own
# accounts, the honest response is to look at why, not to silently truncate the
# set and start counting some of our own personas as users.
_SANITY_CAP = 500

_cache: tuple[float, frozenset[str]] | None = None


def excluded_user_ids(db: Any) -> frozenset[str]:
    """Ids of Myro's own accounts. Empty set when the read fails.

    Fail-soft by choice: an unreadable flag must not take down the landing page
    or a reach script. The cost of degrading is a count that is too HIGH by the
    number of personas, which is visible and self-correcting — where raising
    would take a surface down to protect a rounding error.
    """
    global _cache
    now = time.monotonic()
    if _cache is not None and (now - _cache[0]) < _TTL_SECONDS:
        return _cache[1]

    rows = safe_read(
        db.table("user_profiles")
        .select("id")
        .eq("is_test_account", True)
        .limit(_SANITY_CAP),
        default=[],
        context="test_accounts.excluded_user_ids",
    )
    ids = frozenset(str(row["id"]) for row in rows if row.get("id"))
    if len(ids) >= _SANITY_CAP:
        logger.warning(
            "metric test_accounts.at_sanity_cap count=%d — some of Myro's own "
            "accounts may now be counting as users", len(ids),
        )
    _cache = (now, ids)
    return ids


def reset_cache() -> None:
    """Drop the memo. For tests, and for a script that has just marked an account."""
    global _cache
    _cache = None
