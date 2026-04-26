from fastapi import APIRouter, Depends, status

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    JobCVGenerateRequest,
    JobCVGenerateResponse,
    JobPathMilestoneResponse,
    JobPathMilestoneUpdate,
    JobPathResponse,
    JobPathTargetsRequest,
)
from app.services import jobs_workflow
from app.services.llm_provider import LLMProvider, get_llm_provider

router = APIRouter()


@router.get("/applications/{job_id}/path", response_model=JobPathResponse)
async def get_application_path(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobPathResponse:
    return JobPathResponse(
        **jobs_workflow.get_application_path(repo, current_user["user_id"], job_id)
    )


@router.put("/applications/{job_id}/targets", response_model=JobPathResponse)
async def replace_application_targets(
    job_id: str,
    body: JobPathTargetsRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobPathResponse:
    return JobPathResponse(
        **jobs_workflow.replace_skill_targets(
            repo,
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
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobPathMilestoneResponse:
    return JobPathMilestoneResponse(
        **jobs_workflow.update_milestone(repo, current_user["user_id"], job_id, milestone_id, body)
    )


@router.post("/applications/{job_id}/cv", response_model=JobCVGenerateResponse, status_code=status.HTTP_201_CREATED)
async def generate_application_cv(
    job_id: str,
    body: JobCVGenerateRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    llm_provider: LLMProvider = Depends(get_llm_provider),
) -> JobCVGenerateResponse:
    return JobCVGenerateResponse(
        **await jobs_workflow.generate_job_cv(
            repo=repo,
            user_id=current_user["user_id"],
            job_id=job_id,
            ai_polish=body.ai_polish,
            llm_provider=llm_provider,
        )
    )
