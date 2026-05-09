from fastapi import APIRouter, Depends, status
from supabase import Client

from app.database import get_supabase_for_token
from app.deps import get_current_user
from app.schemas import (
    JobCVGenerateRequest,
    JobCVGenerateResponse,
    JobPathMilestoneResponse,
    JobPathMilestoneUpdate,
    JobPathResponse,
    JobPathTargetsRequest,
)
from app.services import job_path as job_path_service
from app.services.llm_provider import LLMProvider, get_llm_provider

router = APIRouter()


def _get_db(current_user: dict = Depends(get_current_user)) -> Client:
    return get_supabase_for_token(current_user["token"])


@router.get("/applications/{job_id}/path", response_model=JobPathResponse)
async def get_application_path(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(_get_db),
) -> JobPathResponse:
    return JobPathResponse(
        **job_path_service.get_application_path(db, current_user["user_id"], job_id)
    )


@router.put("/applications/{job_id}/targets", response_model=JobPathResponse)
async def replace_application_targets(
    job_id: str,
    body: JobPathTargetsRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(_get_db),
) -> JobPathResponse:
    return JobPathResponse(
        **job_path_service.replace_skill_targets(
            db,
            current_user["user_id"],
            job_id,
            [target.model_dump() for target in body.targets],
        )
    )


@router.put("/applications/{job_id}/milestones/{milestone_id}", response_model=JobPathMilestoneResponse)
async def update_application_milestone(
    job_id: str,
    milestone_id: str,
    body: JobPathMilestoneUpdate,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(_get_db),
) -> JobPathMilestoneResponse:
    return JobPathMilestoneResponse(
        **job_path_service.update_milestone(db, current_user["user_id"], job_id, milestone_id, body)
    )


@router.post("/applications/{job_id}/cv", response_model=JobCVGenerateResponse, status_code=status.HTTP_201_CREATED)
async def generate_application_cv(
    job_id: str,
    body: JobCVGenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(_get_db),
    llm_provider: LLMProvider = Depends(get_llm_provider),
) -> JobCVGenerateResponse:
    return JobCVGenerateResponse(
        **await job_path_service.generate_job_cv(
            db,
            current_user["user_id"],
            job_id,
            ai_polish=body.ai_polish,
            provider=llm_provider,
        )
    )
