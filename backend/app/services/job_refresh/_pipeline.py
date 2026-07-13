"""Compute pipeline used by both inline and async dispatch paths."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date
from typing import Any

from app.repositories.jobs import JobsRepository, get_admin_jobs_repository
from app.services import jobs_workflow
from app.services.jobs_workflow import MatchComputeOutcome

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
    return await jobs_workflow.compute_job_matches(
        repo=jobs_repo,
        user_id=user_id,
        batch_week=batch_week,
        excluded_job_ids=excluded_job_ids,
        force=True,  # paid Refresh: user spent coins → always re-run the brain
        on_progress=on_progress,
    )
