"""Match Run — THE standardized match run every surface routes through.

ONE deep module for "run a match for this user": compute (the strong-judgment triage
+ title_filter pool, `jobs_workflow.compute_job_matches`) → regenerate the Agent Picks
band → fire the fresh-match notification. Before this, only the scrape sweep did picks
+ notify; a paid Refresh and the CV-upload initial match computed but left the picks
band stale and never notified. Routing every surface here means the OUTPUTS of a match
run never drift per-path.

The 100-coin charge (`MATCH_RUN_COST`) is a property of a run, but it lives at the
entry seam that owns the wallet + reveal ticket (`job_refresh`) — that layer already
charges at dispatch and refunds on failure (`_dispatch`). This module owns the WORK.
See CONTEXT.md "Match Run".
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any, Callable

from app.repositories.notifications import NotificationsRepository
from app.services import jobs_workflow, new_inventory
from app.services.jobs_workflow import MatchComputeOutcome
from app.services.matching import agent_picks
from app.services.xp_policy import MATCH_RUN_COST  # noqa: F401 — re-exported: the run's one price

logger = logging.getLogger(__name__)

__all__ = ["run_match", "MATCH_RUN_COST"]


async def run_match(
    repo: Any,
    user_id: str,
    batch_week: date,
    *,
    force: bool = True,
    excluded_job_ids: list[str] | None = None,
    on_progress: Callable[[int, int, dict[str, Any]], None] | None = None,
    notify: bool = True,
    regenerate_picks: bool = True,
    scrape_batch: int | None = None,
) -> MatchComputeOutcome:
    """Run the full standardized match for one user and surface its outputs.

    Compute → Agent Picks regen → fresh-match notification. Picks + notify are
    best-effort side-effects (guarded, logged) — a failure in either never loses the
    compute or its outcome. Returns the `MatchComputeOutcome` so ticket/dispatch callers
    read the same shape they always have.

    `notify=False` for surfaces where the user is watching the reveal live (paid
    Refresh, onboarding initial match) — the bell would be redundant. Background runs
    (sweep, future login-confirm async) leave it on; the notification is debounced.
    """
    before_ids = set(repo.get_existing_match_job_ids(user_id)) if notify else set()

    outcome = await jobs_workflow.compute_job_matches(
        repo=repo,
        user_id=user_id,
        batch_week=batch_week,
        excluded_job_ids=excluded_job_ids,
        force=force,
        on_progress=on_progress,
    )

    # The run happened — stamp the baseline for "new since your last search".
    # Only here: `user_job_matches.computed_at` is also written by on-demand evals
    # and the feed warmer, so inferring the baseline from it let browsing reset it.
    # Read the key OUTSIDE the guard below: that except exists for a failing
    # profiles write, and must not also swallow a wrong-shaped outcome.
    run_context = outcome.context_key
    try:
        # Stamp WHICH direction the run covered, not just that one happened. The
        # key comes off the outcome (the profile the ranking actually used) rather
        # than a re-read here, so a direction change mid-run can't record a key no
        # row was written under.
        repo.mark_match_run(user_id, context_key=run_context)
    except Exception as exc:  # noqa: BLE001 — a missed stamp costs a stale prompt, not the run
        logger.warning("match_run: run marker not stamped user=%s: %s", user_id, exc)

    if regenerate_picks:
        try:
            agent_picks.regenerate_for_user(repo, user_id, scrape_batch=scrape_batch)
        except Exception as exc:  # noqa: BLE001 — picks are a side-effect, never fatal
            logger.warning("match_run: agent_picks regen failed user=%s: %s", user_id, exc)

    # The user has now searched the inventory we announced — retire the prompt
    # whether or not it produced matches, on EVERY path (paid refresh included,
    # where `notify` is off because they watched the reveal live). A bell row that
    # survives the search it asked for is a lie the next login repeats.
    new_inventory.resolve_for_user(user_id)

    if notify:
        try:
            _notify_fresh_matches(repo, user_id, before_ids)
        except Exception as exc:  # noqa: BLE001 — notify is a side-effect, never fatal
            logger.warning("match_run: notify failed user=%s: %s", user_id, exc)

    return outcome


def _notify_fresh_matches(repo: Any, user_id: str, before_ids: set[str]) -> None:
    """Write a debounced 'fresh_matches' notification IF the run produced matches this
    user didn't have before. The ping carries the top new match (highest brain score,
    else overlap) so opening the bell is the reward (Backlog #36 N1). Debounce (12h) is
    enforced in `record_fresh_matches`, so calling it on every run is spam-safe."""
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
    NotificationsRepository(repo.client, repo.client).record_fresh_matches(
        user_id,
        job_id=str(top.get("job_id") or "") or None,
        title=f"{count} fresh match{'es' if count != 1 else ''}",
        body=body,
        count=count,
    )
