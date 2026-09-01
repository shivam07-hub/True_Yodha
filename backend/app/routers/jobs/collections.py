"""The Collection Record's one read.

CONTEXT.md → Collection Record. This replaces three client round trips
(`/jobs/applications`, `/jobs/matches`, `/jobs/pulses`) plus the partition each
of two skins derived from them.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import CollectionResponse
from app.services.collections import PENDING_INTENT_AFTER, resolve_collection
from app.services.concurrent_reads import run_concurrently

from app.services.job_projection import last_monday

router = APIRouter()


@router.get("/collections", response_model=CollectionResponse)
def get_collection(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CollectionResponse:
    """One entry per job, one stage each, plus the counts and the landing stage.

    Five independent reads, one wave — the surface used to pay for them as three
    serial client queries and then compute the partition twice (once per skin),
    off caches that could disagree.
    """
    uid = principal.id
    now = datetime.now(timezone.utc)
    reads = run_concurrently(
        {
            "applications": lambda: repo.get_user_applications(uid),
            "dismissed": lambda: set(repo.get_dismissed_job_card_ids(uid)),
            "tailored": lambda: cv_repo.latest_for_jobs(uid),
            "pending": lambda: repo.get_pending_apply_intent_job_ids(
                uid, older_than=now - PENDING_INTENT_AFTER
            ),
        },
        label="jobs.collections",
    )
    dismissed: set[str] = reads["dismissed"] or set()
    # Dependent on `dismissed` — the stack read takes it rather than paying a
    # second round trip for the same set (same rule as /jobs/matches).
    match_rows = repo.get_user_match_stack(uid, dismissed=dismissed)
    return resolve_collection(
        applications=reads["applications"] or [],
        match_rows=match_rows,
        dismissed_job_ids=dismissed,
        tailored_by_job=reads["tailored"] or {},
        pending_intent_job_ids=reads["pending"] or set(),
        batch_week=last_monday(),
        now=now,
    )
