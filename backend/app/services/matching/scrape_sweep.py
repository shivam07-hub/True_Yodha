"""
services/matching/scrape_sweep.py — event-driven match sweep (Backlog #36 N1/N4).

Supersedes "weekly": scrapes land continuously (by company/industry/location,
often power-user-driven), so instead of a calendar cadence, a sweep resolves
which users are genuinely affected by NEW jobs since a marker, priority-orders
them (users who follow one of the new jobs' companies first — the scrape likely
ran FOR them), caps the fan-out, and enqueues a FREE per-user recompute for each
on the bulk Work Lane.

`compute_job_matches` is already cache-aware (Backlog #36: `ranking.rank` reuses
prior evals, permanent per-(user,job) identity) so a recompute never re-pays the
LLM for a job this user was already rated on — only genuinely new candidates
reach the brain. This is what makes "rate as much as possible" affordable.

Trigger: call `run_sweep(...)` from an admin endpoint or a scheduled task. This
module does NOT wire a live cron — poll cadence is a cost/product decision, not
an engineering default; see CLAUDE.md backlog #36.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
from app.services.job_projection import last_monday
from app.services import background
from app.services.matching import match_run

logger = logging.getLogger(__name__)

# Per-sweep fan-out ceiling — protects the shared LLM Provider Budget (dev+prod
# share one Redis+budget bucket) from a single hot-company scrape.
DEFAULT_SWEEP_CAP = 200


def run_sweep(
    repo: JobsRepository, *, since: datetime, cap: int = DEFAULT_SWEEP_CAP
) -> dict[str, int]:
    """Resolve users affected by jobs that landed after `since`, enqueue a free
    recompute for each (capped, priority-ordered). Returns counts for logging.

    ⚠️ NOT the routine path since 2026-07-28 — the scrape webhook no longer calls
    this. Eagerly matching everyone a landing touches spends the shared LLM budget
    on users who may never return; the product model is user-pulled (see
    `services/new_inventory.py`). Kept for a deliberate admin fan-out (backfill
    after an outage, a hand-run for a specific batch).

    Compute-then-notify (N4): this only ENQUEUES the recompute — the fresh-match
    notification fires after a run actually writes a match, never on speculation.
    """
    new_job_ids = repo.get_new_job_ids_since(since)
    if not new_job_ids:
        return {"new_jobs": 0, "affected_users": 0, "enqueued": 0}

    marker = since.strftime("%Y%m%d%H%M")
    user_ids = repo.get_affected_user_ids(new_job_ids, limit=cap)
    if len(user_ids) >= cap:
        logger.warning("metric scrape_sweep.capped cap=%d — users beyond the cap were dropped", cap)
    for user_id in user_ids:
        background.enqueue(
            background.LANE_BULK,
            "scrape_match_recompute",
            payload={"user_id": user_id, "since_marker": marker},
            # Idempotent per (user, marker) — a re-run of the same sweep (e.g.
            # retry) can't double-enqueue the same user's recompute.
            correlation_id=f"scrape_recompute:{user_id}:{marker}",
        )
    logger.info(
        "metric scrape_sweep.enqueued new_jobs=%d affected=%d enqueued=%d since=%s",
        len(new_job_ids), len(user_ids), len(user_ids), since.isoformat(),
    )
    return {
        "new_jobs": len(new_job_ids),
        "affected_users": len(user_ids),
        "enqueued": len(user_ids),
    }


@background.handler("scrape_match_recompute")
async def _scrape_match_recompute_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    """Per-user free recompute after a scrape sweep. force=False — this user's
    own cache-hit gate inside `compute_job_matches` is the precise check (the
    sweep's pre-filter is a coarse skill/company overlap); it silently no-ops if
    this specific user has nothing new to rate."""

    user_id = payload["user_id"]
    raw_marker = str(payload.get("since_marker") or "")
    # The picks band stores the batch as an int stamp; a non-numeric/absent marker
    # means "no batch attribution", never a fabricated one.
    since_marker = int(raw_marker) if raw_marker.isdigit() else None
    admin_db = get_supabase_admin()
    repo = JobsRepository(admin_db, admin_db)
    try:
        # The whole run — compute → Agent Picks regen → fresh-match notification —
        # is the ONE Match Run module now (compute-then-notify, N4). A background
        # sweep notifies (the user is away); force=False so the per-user cache-hit
        # gate silently no-ops a user with nothing new.
        await match_run.run_match(
            repo,
            user_id,
            last_monday(),
            force=False,
            notify=True,
            scrape_batch=since_marker,
        )
    except Exception as exc:
        # Best-effort — a sweep recompute failing for one user must never break
        # the sweep or retry-storm; log and move on (fire-and-forget, same
        # posture as cv_workflow._trigger_initial_match_compute).
        logger.warning("scrape_match_recompute failed for user=%s: %s", user_id, exc)
