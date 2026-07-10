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
from typing import Any

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
from app.services import background, jobs_workflow
from app.services.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)

# Per-sweep fan-out ceiling — protects the shared LLM Provider Budget (dev+prod
# share one Redis+budget bucket) from a single hot-company scrape.
DEFAULT_SWEEP_CAP = 200


def run_sweep(
    repo: JobsRepository, *, since_marker: int, cap: int = DEFAULT_SWEEP_CAP
) -> dict[str, int]:
    """Resolve users affected by jobs new since `since_marker`, enqueue a free
    recompute for each (capped, priority-ordered). Returns counts for logging.

    Compute-then-notify (N4): this only ENQUEUES the recompute — Slice 2 wires
    the notification to fire after the enqueued job actually writes a fresh
    match, never on the sweep call itself (never notify on speculation).
    """
    new_job_ids = repo.get_new_job_ids_since(since_marker)
    if not new_job_ids:
        return {"new_jobs": 0, "affected_users": 0, "enqueued": 0}

    user_ids = repo.get_affected_user_ids(new_job_ids, limit=cap)
    for user_id in user_ids:
        background.enqueue(
            background.LANE_BULK,
            "scrape_match_recompute",
            payload={"user_id": user_id},
            # Idempotent per (user, marker) — a re-run of the same sweep (e.g.
            # retry) can't double-enqueue the same user's recompute.
            correlation_id=f"scrape_recompute:{user_id}:{since_marker}",
        )
    logger.info(
        "metric scrape_sweep.enqueued new_jobs=%d affected=%d enqueued=%d marker=%d",
        len(new_job_ids), len(user_ids), len(user_ids), since_marker,
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
    from app.routers.jobs._shared import last_monday  # local: avoid router→service load cycle

    user_id = payload["user_id"]
    admin_db = get_supabase_admin()
    repo = JobsRepository(admin_db, admin_db)
    try:
        await jobs_workflow.compute_job_matches(
            repo=repo,
            user_id=user_id,
            batch_week=last_monday(),
            llm_provider=get_llm_provider(),
            force=False,
        )
    except Exception as exc:
        # Best-effort — a sweep recompute failing for one user must never break
        # the sweep or retry-storm; log and move on (fire-and-forget, same
        # posture as cv_workflow._trigger_initial_match_compute).
        logger.warning("scrape_match_recompute failed for user=%s: %s", user_id, exc)
