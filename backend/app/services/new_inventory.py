"""services/new_inventory.py — "jobs landed that this user has never searched".

ONE definition of new inventory, because three surfaces need the same answer and
must never disagree: the /matches signal the feed renders, the bell announcement
at login, and the charge waiver on a match run. When those drift, a user is told
"12,000 new roles" and then billed to look at nothing.

Model (Shivam, 2026-07-28): Myro does NOT match everybody when a scrape lands —
that spends LLM budget on users who never come back. The landing writes rows; the
user's next visit turns it into a visible prompt; the user pulls the match. Compute
follows intent. This module is the seam between "inventory landed" and "you have
something to search", and it holds nothing else.

Truth source is `jobs.ingested_at` (DB-owned timestamp), never the scraper's
`first_seen` date-int — see migration 20260728_jobs_ingested_at.sql.
"""
from __future__ import annotations

import logging
from typing import Any

from app.database import get_supabase_admin
from app.repositories.notifications import NotificationsRepository

logger = logging.getLogger(__name__)

__all__ = ["count_for_user", "announce_for_user", "resolve_for_user"]


def count_for_user(repo: Any, user_id: str) -> int:
    """Live jobs that landed after this user's last match compute.

    0 for a never-matched user: nothing is "new" without a baseline, and the
    honest prompt for them is "run your first match", not a count.
    """
    try:
        return repo.count_new_jobs_for_user(user_id)
    except Exception as exc:  # noqa: BLE001 — a count is never worth a 500
        logger.warning("new_inventory: count failed user=%s: %s", user_id, exc)
        return 0


def announce_for_user(user_id: str, count: int) -> None:
    """Project the count into the inbox (debounced, one live row per user).

    Best-effort by construction: this runs off the read path, so a failure must
    cost the user their bell row, never their feed.
    """
    if count <= 0:
        return
    try:
        admin = get_supabase_admin()
        changed = NotificationsRepository(admin, admin).record_new_inventory(user_id, count=count)
        if changed:
            logger.info("metric new_inventory.announced user=%s count=%d", user_id, count)
    except Exception as exc:  # noqa: BLE001
        logger.warning("new_inventory: announce failed user=%s: %s", user_id, exc)


def resolve_for_user(user_id: str) -> None:
    """The user ran the match — retire the announcement so the bell doesn't nag
    about inventory they just searched."""
    try:
        admin = get_supabase_admin()
        NotificationsRepository(admin, admin).resolve_new_inventory(user_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("new_inventory: resolve failed user=%s: %s", user_id, exc)
