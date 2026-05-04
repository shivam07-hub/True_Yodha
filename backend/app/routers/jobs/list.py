from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.repositories.jobs import JobsRepository, get_public_jobs_repository
from app.schemas import (
    JobSearchResponse,
    MarketAnalyticsResponse,
    NameCountItem,
    SkillCountItem,
)
from app.schemas.jobs import JobSearchItem

router = APIRouter()


@router.get("/analytics", response_model=MarketAnalyticsResponse)
async def get_market_analytics(
    role_domain: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> MarketAnalyticsResponse:
    analytics = repo.compile_market_analytics(role_domain=role_domain)

    return MarketAnalyticsResponse(
        total_jobs=analytics["total_jobs"],
        total_companies=analytics["total_companies"],
        total_industries=analytics["total_industries"],
        latest_batch=analytics["latest_batch"],
        by_company=[NameCountItem(name=name, count=count) for name, count in analytics["by_company"]],
        by_industry=[NameCountItem(name=name, count=count) for name, count in analytics["by_industry"]],
        by_role=[NameCountItem(name=name, count=count) for name, count in analytics["by_role"]],
        top_skills=[SkillCountItem(skill=skill, count=count) for skill, count in analytics["top_skills"]],
        company_skills=analytics["company_skills"],
        industry_skills=analytics["industry_skills"],
    )


@router.get("/search", response_model=JobSearchResponse)
async def search_jobs(
    company: Annotated[str, Query(min_length=1)],
    skill: Annotated[str, Query(min_length=1)],
    role_domain: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> JobSearchResponse:
    page_result = repo.search_jobs_by_filters(
        company,
        skill,
        role_domain=role_domain,
        page=page,
        page_size=page_size,
    )
    items = [
        JobSearchItem(
            job_id=row["job_id"],
            job_title=row.get("job_title") or "",
            company_name=row.get("company_name"),
            job_description=row.get("job_description"),
        )
        for row in page_result["rows"]
    ]
    return JobSearchResponse(
        jobs=items,
        available_total=page_result["available_total"],
        returned_total=page_result["returned_total"],
        page=page_result["page"],
        page_size=page_result["page_size"],
        has_next_page=page_result["has_next_page"],
    )
