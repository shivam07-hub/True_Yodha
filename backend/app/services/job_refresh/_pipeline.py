"""Compute pipeline used by both inline and async dispatch paths."""

from __future__ import annotations

import logging
from datetime import date

from app.repositories.jobs import JobsRepository, get_admin_jobs_repository
from app.services import jobs_workflow
from app.services.jobs_workflow import MatchComputeOutcome
from app.services.llm_provider import get_paid_jobs_provider

_log = logging.getLogger(__name__)


async def run(
    user_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    *,
    repo: JobsRepository | None = None,
) -> MatchComputeOutcome:
    """Execute the compute pipeline. Paid refresh path → fast-lane LLM provider."""
    jobs_repo = repo or get_admin_jobs_repository()
    llm_provider = get_paid_jobs_provider()
    return await jobs_workflow.compute_job_matches(
        repo=jobs_repo,
        user_id=user_id,
        batch_week=batch_week,
        llm_provider=llm_provider,
        excluded_job_ids=excluded_job_ids,
    )
