"""Compute pipeline used by both inline and async dispatch paths."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date
from typing import Any

from app.repositories.jobs import JobsRepository, get_admin_jobs_repository
from app.services.jobs_workflow import MatchComputeOutcome
from app.services.matching import match_run

_log = logging.getLogger(__name__)


async def run(
    user_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    *,
    repo: JobsRepository | None = None,
    on_progress: Callable[[int, int, dict[str, Any]], None] | None = None,
) -> MatchComputeOutcome:
    """Execute the compute pipeline.

    The provider is no longer chosen here: `compute_job_matches` owns the strong-only
    judgment lane (the model floor, feedback_no_cheap_models_judgment), so every run —
    paid Refresh, CV upload, sweep — ranks on the same strong models. `on_progress`
    is forwarded to the ranker so the dispatch layer can publish per-job reveal progress.
    """
    jobs_repo = repo or get_admin_jobs_repository()
    # The whole run goes through the ONE Match Run module: compute → Agent Picks regen
    # → (no bell — the reveal streams live, notify=False). Before this a paid Refresh
    # computed but left the picks band stale; now every surface refreshes it.
    return await match_run.run_match(
        jobs_repo,
        user_id,
        batch_week,
        force=True,  # paid Refresh: user spent coins → always re-run the brain
        excluded_job_ids=excluded_job_ids,
        on_progress=on_progress,
        notify=False,
    )
