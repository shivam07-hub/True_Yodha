"""Where the jobs came from — provenance + verified-live counts.

One read model behind two surfaces: the public landing counters and the authed
Collections rail card. Both answer the same question ("who put these jobs
here, and how many do we actually know are alive"), so they share one module
rather than drifting into two counts of the same thing.

Two deliberate choices:

* **The hero is `verified_live_7d`, not `total`.** Total is the number every
  job board prints and nobody believes. A listing we have personally opened
  inside the last week is the only count we can defend when a user clicks it.
  ``total`` is still returned — as the denominator, so the unchecked remainder
  is visible rather than hidden.
* **Source is split on `ingestion_source`.** Extension rows are the community's;
  everything else is the agent's. `NULL` counts as agent — pre-extension crawl
  rows predate the column and were all ours.

**The counts are Tier 0** (migration 20261019090000, ARCHITECTURE_READ_PATH.md
§30). `refresh_public_provenance()` computes them on the in-database rail and
is the one definition of "verified live" and its window; this module reads the
row and counts nothing. Counted here, `verified_live` averaged 3.3s, hit the 8s
ceiling, and a cold build ran it 45 times in a minute on the shared database.
"""

from __future__ import annotations

import logging

from supabase import Client

log = logging.getLogger(__name__)

_SNAPSHOT_COLUMNS = "total,community,verified_live,verified_window_days"

# No row, or a read that failed: no number. Every field is zero together, and
# the one surface that renders these reads `total == 0` as "Myro is counting the
# pool". The three counts arrive in one row, so a real total can never sit
# beside a verified-live of 0 that only means one count failed.
_NO_NUMBER = {
    "total": 0,
    "agent": 0,
    "community": 0,
    "verified_live": 0,
    "verified_window_days": 0,
}


def read_provenance(db: Client) -> dict[str, int]:
    """Collective counts: total pool, verified-live, and the source split."""
    try:
        rows = (
            db.table("public_provenance_snapshot")
            .select(_SNAPSHOT_COLUMNS)
            .eq("id", 1)
            .limit(1)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001 — a counter must not take a page down
        log.warning("job_provenance: snapshot read failed: %s", exc)
        return dict(_NO_NUMBER)
    if not rows:
        log.warning("job_provenance: public_provenance_snapshot has no row")
        return dict(_NO_NUMBER)
    row = rows[0]
    total = int(row["total"])
    community = int(row["community"])
    return {
        "total": total,
        # Derived, not counted — the two can never disagree about what they
        # sum to.
        "agent": max(total - community, 0),
        "community": community,
        "verified_live": int(row["verified_live"]),
        "verified_window_days": int(row["verified_window_days"]),
    }


def _count_mine(db: Client, user_id: str) -> int:
    """Jobs this user put into the pool, or 0 when the read fails. 1.3ms: an
    exact count on `created_by_user_id`, the one count still live."""
    try:
        result = (
            db.table("jobs")
            .select("job_id", count="exact")
            .eq("created_by_user_id", user_id)
            .limit(1)
            .execute()
        )
        return int(result.count or 0)
    except Exception as exc:  # noqa: BLE001 — a counter must not take a page down
        log.warning("job_provenance: count failed: %s", exc)
        return 0


def read_contributions(db: Client, user_id: str) -> dict[str, int]:
    """The collective counts plus this user's own contribution.

    `created_by_user_id` is stamped by the extension import path, so `mine` is
    "jobs I put into the shared pool" — not "jobs I saved", which is a
    `job_applications` question and a different card.
    """
    counts = read_provenance(db)
    counts["mine"] = _count_mine(db, user_id)
    return counts
