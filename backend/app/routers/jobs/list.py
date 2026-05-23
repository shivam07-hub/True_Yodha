from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.deps import Principal, get_principal
from app.repositories.jobs import (
    CompanySearchUnavailable,
    JobsRepository,
    get_public_jobs_repository,
    get_token_jobs_repository,
)
from app.schemas import (
    EntitySkillsResponse,
    JobSearchResponse,
    MarketAnalyticsSummaryResponse,
    NameCountItem,
    SkillCountItem,
)
from app.schemas.jobs import JobSearchItem, SkillHeatmapResponse

router = APIRouter()


@router.get("/companies/search")
async def search_companies(
    q: Annotated[str, Query(min_length=2, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> list[str]:
    try:
        return repo.search_companies(q, limit=limit)
    except CompanySearchUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Company search is temporarily unavailable.",
        ) from exc


@router.get("/analytics/me", response_model=MarketAnalyticsSummaryResponse)
async def get_my_analytics(
    cluster: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_token_jobs_repository),
    principal: Principal = Depends(get_principal),
) -> MarketAnalyticsSummaryResponse:
    if cluster:
        role_domain = repo.resolve_role_domain_for_clusters([cluster])
    else:
        target_roles = repo.get_user_target_roles(principal.id)
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


@router.get("/analytics/skill-heatmap", response_model=SkillHeatmapResponse)
async def get_skill_heatmap(
    companies: Annotated[str, Query(min_length=1)],
    skills: Annotated[str, Query(min_length=1)],
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> SkillHeatmapResponse:
    company_list = [c.strip() for c in companies.split(",") if c.strip()]
    skill_list = [s.strip() for s in skills.split(",") if s.strip()]
    if len(company_list) == 1:
        row = repo.fetch_skill_heatmap_row(
            company_list[0], skill_list,
            location_city=location_city,
            location_country=location_country,
            location_mode=location_mode,
        )
        return SkillHeatmapResponse(matrix={company_list[0]: row})
    matrix = repo.fetch_skill_heatmap(company_list, skill_list)
    return SkillHeatmapResponse(matrix=matrix)


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
