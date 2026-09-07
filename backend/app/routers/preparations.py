"""The prep ladder — one contract behind every surface in Unified Prep v2.

Design: `UNIFIED_PREP_V2.md` (repo root).

The rail's pips, the room's readiness ring and the mobile stack all render the
same four steps from this one read, so they cannot disagree about which step a
room is on. The three Finlatics cards ride along because they are computed from
the same skill gaps the ladder already resolved — asking for them separately
would re-read `job_skills` for the same board.
"""
from fastapi import APIRouter, Depends

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas.preparations import (
    PrepLadderResponse,
    RehearsalState,
    RehearsalUpdate,
)
from app.services import prep_rehearsal
from app.services.prep_ladder_read import assemble

router = APIRouter(prefix="/preparations", tags=["preparations"])


@router.get("/ladder", response_model=PrepLadderResponse)
def get_prep_ladder(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> PrepLadderResponse:
    return PrepLadderResponse(**assemble(repo, principal.id))


@router.get("/{job_id}/rehearsal", response_model=RehearsalState)
def get_rehearsal(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> RehearsalState:
    return RehearsalState(**prep_rehearsal.read_state(repo, principal.id, job_id))


@router.put("/{job_id}/rehearsal", response_model=RehearsalState)
def put_rehearsal(
    job_id: str,
    body: RehearsalUpdate,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> RehearsalState:
    """Record which questions have been worked. Returns the state the server
    actually holds, so the panel renders the truth rather than its own guess."""
    return RehearsalState(
        **prep_rehearsal.write_state(repo, principal.id, job_id, body.rehearsed)
    )
