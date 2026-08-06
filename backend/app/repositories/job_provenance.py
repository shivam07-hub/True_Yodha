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
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

log = logging.getLogger(__name__)

# The window the hero number claims. Seven days is the promise a user can check:
# open the listing, it is there. Widen this and the claim starts outrunning the
# verifier's actual sweep cadence.
VERIFIED_WINDOW_DAYS = 7

# `jobs.ingestion_source` value written by the extension import path
# (services/job_importer.build_imported_job). Everything else — and NULL — is
# agent-crawled.
COMMUNITY_SOURCE = "extension"


def _count(db: Client, apply: Any) -> int:
    """Exact row count for a filtered `jobs` query, or 0 when the read fails.

    A counter is decoration on every surface that shows it; a failed count must
    degrade to "no number", never to a 500 on the landing page. The failure is
    logged so a persistently zero counter is traceable to its cause instead of
    being read as real.
    """
    try:
        query = db.table("jobs").select("job_id", count="exact").limit(1)
        result = apply(query).execute()
        return int(result.count or 0)
    except Exception as exc:  # noqa: BLE001 — a counter must not take a page down
        log.warning("job_provenance: count failed: %s", exc)
        return 0


def _verified_cutoff() -> str:
    cutoff = datetime.now(timezone.utc) - timedelta(days=VERIFIED_WINDOW_DAYS)
    return cutoff.isoformat()


def read_provenance(db: Client) -> dict[str, int]:
    """Collective counts: total pool, verified-live, and the source split."""
    total = _count(db, lambda q: q)
    community = _count(db, lambda q: q.eq("ingestion_source", COMMUNITY_SOURCE))
    verified_live = _count(
        db, lambda q: q.gte("last_verified_live_at", _verified_cutoff())
    )
    return {
        "total": total,
        # Derived, not counted — one less scan, and the two can never disagree
        # about what they sum to.
        "agent": max(total - community, 0),
        "community": community,
        "verified_live": verified_live,
        "verified_window_days": VERIFIED_WINDOW_DAYS,
    }


def read_contributions(db: Client, user_id: str) -> dict[str, int]:
    """The collective counts plus this user's own contribution.

    `created_by_user_id` is stamped by the extension import path, so `mine` is
    "jobs I put into the shared pool" — not "jobs I saved", which is a
    `job_applications` question and a different card.
    """
    counts = read_provenance(db)
    counts["mine"] = _count(db, lambda q: q.eq("created_by_user_id", user_id))
    return counts
