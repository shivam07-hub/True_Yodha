from fastapi import APIRouter, Depends
from supabase import Client

from app.deps import Principal, get_principal, get_user_db
from app.schemas import (
    JobPathMilestoneResponse,
    JobPathMilestoneUpdate,
    JobPathResponse,
    JobPathTargetsRequest,
)
from app.services import job_path as job_path_service

router = APIRouter()


@router.get("/applications/{job_id}/path", response_model=JobPathResponse)
async def get_application_path(
    job_id: str,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> JobPathResponse:
    return JobPathResponse(
        **job_path_service.get_application_path(db, principal.id, job_id)
    )


@router.put("/applications/{job_id}/targets", response_model=JobPathResponse)
async def replace_application_targets(
    job_id: str,
    body: JobPathTargetsRequest,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> JobPathResponse:
    return JobPathResponse(
        **job_path_service.replace_skill_targets(
            db,
            principal.id,
            job_id,
            [target.model_dump() for target in body.targets],
        )
    )


@router.put("/applications/{job_id}/milestones/{milestone_id}", response_model=JobPathMilestoneResponse)
async def update_application_milestone(
    job_id: str,
    milestone_id: str,
    body: JobPathMilestoneUpdate,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> JobPathMilestoneResponse:
    return JobPathMilestoneResponse(
        **job_path_service.update_milestone(db, principal.id, job_id, milestone_id, body)
    )
