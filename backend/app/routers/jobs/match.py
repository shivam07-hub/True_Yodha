from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    ComputeJobMatchesResponse,
    JobMatchesResponse,
    UserSkillDemandResponse,
)
from app.services import jobs_workflow
from app.services.llm_provider import LLMProvider, get_llm_provider

from ._shared import last_monday, to_job_match

router = APIRouter()


@router.get("/my-skills/demand", response_model=UserSkillDemandResponse)
async def get_my_skill_demand(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> UserSkillDemandResponse:
    items = jobs_workflow.build_user_skill_demand(repo, current_user["user_id"])
    return UserSkillDemandResponse(skills=items, total=len(items))


@router.get("/matches", response_model=JobMatchesResponse)
async def get_job_matches(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobMatchesResponse:
    batch_week = last_monday()
    rows = repo.get_user_matches_for_week(current_user["user_id"], batch_week)
    jobs = [to_job_match(row, batch_week) for row in rows]
    return JobMatchesResponse(jobs=jobs, batch_week=batch_week, total=len(jobs))


@router.post("/compute", response_model=ComputeJobMatchesResponse)
async def compute_job_matches(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    llm_provider: LLMProvider = Depends(get_llm_provider),
) -> ComputeJobMatchesResponse:
    user_id = current_user["user_id"]
    batch_week = last_monday()
    payload = await jobs_workflow.compute_job_matches(
        repo=repo,
        user_id=user_id,
        batch_week=batch_week,
        llm_provider=llm_provider,
    )
    return ComputeJobMatchesResponse(**payload)
