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
from app.repositories.notifications import NotificationsRepository
from app.services import background, jobs_workflow
from app.services.matching import agent_picks

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
            payload={"user_id": user_id, "since_marker": since_marker},
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
    since_marker = payload.get("since_marker")
    admin_db = get_supabase_admin()
    repo = JobsRepository(admin_db, admin_db)
    try:
        # Snapshot BEFORE so we can diff genuinely-new matches after — the
        # notification (N1) must carry real fresh matches, never fire on a
        # no-op recompute (N4: compute-then-notify, never on speculation).
        before_ids = set(repo.get_existing_match_job_ids(user_id))
        await jobs_workflow.compute_job_matches(
            repo=repo,
            user_id=user_id,
            batch_week=last_monday(),
            force=False,
        )
        _notify_fresh_matches(admin_db, repo, user_id, before_ids)
        # N5: fold Agent Picks into the SAME brain pass — the eval just ran, so
        # re-cut the editorial band from the fresh verdicts (reuses cached evals,
        # no new LLM). Guarded separately so a pick-gen failure never loses the
        # recompute or the notification above.
        try:
            agent_picks.regenerate_for_user(repo, user_id, scrape_batch=since_marker)
        except Exception as pick_exc:
            logger.warning("agent_picks regen failed for user=%s: %s", user_id, pick_exc)
    except Exception as exc:
        # Best-effort — a sweep recompute failing for one user must never break
        # the sweep or retry-storm; log and move on (fire-and-forget, same
        # posture as cv_workflow._trigger_initial_match_compute).
        logger.warning("scrape_match_recompute failed for user=%s: %s", user_id, exc)


def _notify_fresh_matches(
    admin_db: Any, repo: JobsRepository, user_id: str, before_ids: set[str]
) -> None:
    """Write a debounced 'fresh_matches' notification IF the recompute produced
    matches this user didn't have before. The ping carries the top new match
    (highest brain score, else overlap) so opening the bell is the reward (N1)."""
    stack = repo.get_user_match_stack(user_id)
    new_rows = [r for r in stack if str(r.get("job_id") or "") not in before_ids]
    if not new_rows:
        return

    top = max(
        new_rows,
        key=lambda r: (float(r.get("overall_score") or 0), float(r.get("overlap_score") or 0)),
    )
    job = top.get("jobs") or {}
    company = (job.get("company_name") or "").strip()
    role = (job.get("job_title") or "").strip()
    body = " · ".join(p for p in (company, role) if p) or "New role matched to your profile"

    count = len(new_rows)
    NotificationsRepository(admin_db, admin_db).record_fresh_matches(
        user_id,
        job_id=str(top.get("job_id") or "") or None,
        title=f"{count} fresh match{'es' if count != 1 else ''}",
        body=body,
        count=count,
    )
