from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_public_jobs_repository, get_token_jobs_repository
from app.schemas import (
    EntitySkillsResponse,
    JobSearchResponse,
    MarketAnalyticsSummaryResponse,
    NameCountItem,
    SkillCountItem,
)
from app.schemas.jobs import JobSearchItem

router = APIRouter()



@router.get("/analytics/me", response_model=MarketAnalyticsSummaryResponse)
async def get_my_analytics(
    cluster: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_token_jobs_repository),
    current_user: dict = Depends(get_current_user),
) -> MarketAnalyticsSummaryResponse:
    if cluster:
        role_domain = repo.resolve_role_domain_for_clusters([cluster])
    else:
        target_roles = repo.get_user_target_roles(current_user["user_id"])
        role_domain = repo.resolve_role_domain_for_clusters(target_roles) if target_roles else None
    analytics = repo.compile_market_analytics(
        role_domain=role_domain,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
    )
    return MarketAnalyticsSummaryResponse(
        total_jobs=analytics["total_jobs"],
        total_companies=analytics["total_companies"],
        total_industries=analytics["total_industries"],
        latest_batch=analytics["latest_batch"],
        by_company=[NameCountItem(name=name, count=count) for name, count in analytics["by_company"]],
        by_industry=[NameCountItem(name=name, count=count) for name, count in analytics["by_industry"]],
        by_role=[NameCountItem(name=name, count=count) for name, count in analytics["by_role"]],
        by_location_city=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_city"]],
        by_location_country=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_country"]],
        by_location_mode=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_mode"]],
    )


@router.get("/analytics/skills", response_model=EntitySkillsResponse)
async def get_entity_skills(
    entity: str,
    type: str = "company",
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> EntitySkillsResponse:
    skills = repo.fetch_entity_skills(
        entity_name=entity,
        entity_type=type,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
    )
    return EntitySkillsResponse(
        entity=entity,
        type=type,
        skills=[SkillCountItem(skill=s["skill"], count=s["count"]) for s in skills],
    )


@router.get("/analytics", response_model=MarketAnalyticsSummaryResponse)
async def get_market_analytics(
    role_domain: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> MarketAnalyticsSummaryResponse:
    analytics = repo.compile_market_analytics(
        role_domain=role_domain,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
    )
    return MarketAnalyticsSummaryResponse(
        total_jobs=analytics["total_jobs"],
        total_companies=analytics["total_companies"],
        total_industries=analytics["total_industries"],
        latest_batch=analytics["latest_batch"],
        by_company=[NameCountItem(name=name, count=count) for name, count in analytics["by_company"]],
        by_industry=[NameCountItem(name=name, count=count) for name, count in analytics["by_industry"]],
        by_role=[NameCountItem(name=name, count=count) for name, count in analytics["by_role"]],
        by_location_city=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_city"]],
        by_location_country=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_country"]],
        by_location_mode=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_mode"]],
    )


@router.get("/search", response_model=JobSearchResponse)
async def search_jobs(
    company: Annotated[str, Query(min_length=1)],
    skill: Annotated[str, Query(min_length=1)],
    role_domain: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> JobSearchResponse:
    page_result = repo.search_jobs_by_filters(
        company,
        skill,
        role_domain=role_domain,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
        page=page,
        page_size=page_size,
    )
    items = [
        JobSearchItem(
            job_id=row["job_id"],
            job_title=row.get("job_title") or "",
            company_name=row.get("company_name"),
            job_description=row.get("job_description"),
            location=row.get("location"),
            location_city=row.get("location_city"),
            location_country=row.get("location_country"),
            location_mode=row.get("location_mode"),
            location_quality=row.get("location_quality"),
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
