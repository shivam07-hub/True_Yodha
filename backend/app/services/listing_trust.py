"""What we may honestly claim about a listing — one definition, every surface.

Two different events write `jobs.last_verified_live_at`, and they mean different
things:

  * the crawler, when a job_id appears in an employer's source FEED
    (myro-job-scraper `lifecycle_writer.apply_seen`) — list membership, and
    it also stamps `listing_confidence = 'active'`;
  * the verifier, when it FETCHED the apply URL and a live posting answered
    (`repositories/job_listing_verification`).

Only the second is a check, and only the second also writes
`last_conclusive_verification_at`. Measured 2026-09-22: 19,258 live listings
carried the crawl's stamp and 18,080 of those had never been conclusively
checked — 47% of the corpus wearing a word it had not earned.

The cost is not theoretical. A shortlist built for one user on 2026-08-27 was
opened by hand: 13 of 43 roles were already closed, and our own records still
called 8 of those 13 active. Roughly three in ten unchecked listings die within
a fortnight, so a claim without an age is not a claim.

This module is the only place allowed to answer "may we say this was checked".
It takes WHEN we looked and WHAT the look found from `listing_time` — one
definition, shared with every job card: `checked_at` is the last conclusive
check, `confirmed_at` is that check when it found the listing live. The
lifecycle columns cannot answer WHAT on their own: the crawler rewrites
`is_active` and `listing_confidence` to live on every feed sighting, including
right after a verifier found the listing closed (813 rows inside one week,
measured 2026-10-06).

NOT fixed here, deliberately: the crawler still writes
`last_verified_live_at`. Splitting the write side means a new
`last_source_seen_at` column and a scraper release, and the matcher's
`get_candidate_job_ids_for_roles` currently ORDERS by that column — stopping the
write without moving the ordering would silently reshuffle which jobs reach the
brain. Read seam first; write seam with the retrieval work.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.listing_time import CONFIRM_WITHIN, verdict as listing_time

__all__ = ["CHECKED_FRESH_DAYS", "checked_cutoff", "verification_claim", "was_checked_within"]

#: How long a conclusive check stays sayable. The number lives on listing
#: time; past it the honest word is "not checked lately".
CHECKED_FRESH_DAYS = CONFIRM_WITHIN.days


def checked_cutoff(*, days: int = CHECKED_FRESH_DAYS, now: datetime | None = None) -> datetime:
    return (now or datetime.now(timezone.utc)) - timedelta(days=days)


def _found_live(row: dict[str, Any], confirmed_at: datetime | None) -> bool:
    """The last check found it live, and nothing has withdrawn `active` since.

    `last_conclusive_verification_at` alone is "we opened it", not "it is open".
    Measured 2026-09-23: of 27,681 listings checked inside a week, 8,295 had
    been checked and found DEAD — counting the column by itself would have
    called every one of them verified live, which is a worse claim than the one
    this module exists to fix. The lifecycle half still counts: a listing
    retired by the crawl's misses, or degraded by failed fetches, is not one
    we may call checked and live.
    """
    return confirmed_at is not None and bool(row.get("is_active", True)) and (
        row.get("listing_confidence", "active") == "active"
    )


def was_checked_within(
    row: dict[str, Any], *, days: int = CHECKED_FRESH_DAYS, now: datetime | None = None
) -> bool:
    """True only if a verifier fetched this listing inside the window AND found
    it live. Both halves, or the claim is not one."""
    moment = now or datetime.now(timezone.utc)
    when = listing_time(row, now=moment)
    checked = when.checked_at
    if not (checked and checked >= checked_cutoff(days=days, now=moment)):
        return False
    return _found_live(row, when.confirmed_at)


def verification_claim(
    row: dict[str, Any], *, days: int = CHECKED_FRESH_DAYS, now: datetime | None = None
) -> dict[str, Any]:
    """The honest trust block for one listing.

    `state` is one of:
      `checked`   — a verifier opened the employer's page inside the window
                    and a live posting answered
      `closed`    — a verifier opened it and it was gone, redirected or
                    another role — even if the crawler has since re-activated it
      `stale`     — it was checked and live, but longer ago than the window
      `unchecked` — nobody has ever opened it; the crawler seeing it in a feed
                    is not the same thing, and is reported separately

    `unchecked` is NOT "dead", and must never be rendered as one. It is the
    absence of evidence, which the surface discloses so the reader can decide.
    """
    moment = now or datetime.now(timezone.utc)
    when = listing_time(row, now=moment)
    checked = when.checked_at
    if checked is None:
        state = "unchecked"
    elif not _found_live(row, when.confirmed_at):
        # Checked, and the answer was no. Never dressed as a softer word.
        state = "closed"
    elif checked >= checked_cutoff(days=days, now=moment):
        state = "checked"
    else:
        state = "stale"
    return {
        "state": state,
        "checked_at": checked.isoformat() if checked else None,
        # What the crawler saw, kept separate and named for what it is.
        "source_seen_at": row.get("last_verified_live_at"),
        "window_days": days,
    }
