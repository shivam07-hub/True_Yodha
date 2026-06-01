from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.deps import Principal, get_principal
from app.repositories.jobs import (
    CompanySearchUnavailable,
    JobsRepository,
    _job_feed_marker_to_iso,
    get_public_jobs_repository,
    get_token_jobs_repository,
)
from app.schemas import (
    AnalyticsSnapshotRefreshResponse,
    CompanyOpenRoleItem,
    CompanyOpenRolesResponse,
    EntitySkillsResponse,
    GlobalJobHit,
    GlobalJobSearchResponse,
    JobSearchResponse,
    MarketAnalyticsSummaryResponse,
    NameCountItem,
    SkillCountItem,
)
from app.schemas.jobs import (
    JobFeedItem,
    JobFeedResponse,
    JobSearchItem,
    SkillHeatmapResponse,
)

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
        total_jobs_today=analytics.get("total_jobs_today", 0),
        jobs_added_1h=analytics.get("jobs_added_1h", 0),
        companies_added_7d=analytics.get("companies_added_7d", 0),
        by_company=[
            NameCountItem(
                name=name,
                count=count,
                last_seen_at=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("last_seen_at"),
                velocity_bins=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("velocity_bins"),
                country=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("country"),
                industry=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("industry"),
            )
            for name, count in analytics["by_company"]
        ],
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
        total_jobs_today=analytics.get("total_jobs_today", 0),
        jobs_added_1h=analytics.get("jobs_added_1h", 0),
        companies_added_7d=analytics.get("companies_added_7d", 0),
        by_company=[
            NameCountItem(
                name=name,
                count=count,
                last_seen_at=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("last_seen_at"),
                velocity_bins=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("velocity_bins"),
                country=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("country"),
                industry=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("industry"),
            )
            for name, count in analytics["by_company"]
        ],
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


@router.get("/feed", response_model=JobFeedResponse)
async def job_feed(
    cluster: str | None = None,
    role_domain: str | None = None,
    q: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    sort: str = "fresh",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
    repo: JobsRepository = Depends(get_token_jobs_repository),
    principal: Principal = Depends(get_principal),
) -> JobFeedResponse:
    """Authed /market browse feed. Company-agnostic, filterable, paginated.

    Resolves a target-role `cluster` (or explicit `role_domain`) to a jobs.role_domain
    filter, mirrors the analytics/me cluster logic. Always computes the requesting
    user's CV-skill overlap so every card can show 'N of your skills match'; the
    `personal` sort ranks on that overlap.
    """
    resolved_domain = role_domain
    if not resolved_domain and cluster:
        resolved_domain = repo.resolve_role_domain_for_clusters([cluster])
    skill_keys = repo.user_skill_keys(principal.id)
    page_result = repo.feed_jobs(
        role_domain=resolved_domain,
        q=q,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
        sort=sort,
        user_skill_keys=skill_keys,
        page=page,
        page_size=page_size,
    )
    items = [JobFeedItem(**row) for row in page_result["rows"]]
    return JobFeedResponse(
        jobs=items,
        available_total=page_result["available_total"],
        returned_total=page_result["returned_total"],
        page=page_result["page"],
        page_size=page_result["page_size"],
        has_next_page=page_result["has_next_page"],
        sort=page_result["sort"],
    )


@router.get("/at/{company}", response_model=CompanyOpenRolesResponse)
async def list_company_open_roles(
    company: str,
    limit: Annotated[int, Query(ge=1, le=50)] = 6,
    location_country: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> CompanyOpenRolesResponse:
    """Public — latest N roles at a company. Powers /intel Open Roles panel."""
    rows = repo.list_jobs_at_company(company, limit=limit, location_country=location_country)
    return CompanyOpenRolesResponse(
        company=company,
        jobs=[
            CompanyOpenRoleItem(
                job_id=str(r["job_id"]),
                job_title=r.get("job_title") or "",
                location_city=r.get("location_city"),
                location_country=r.get("location_country"),
                location_mode=r.get("location_mode"),
                created_at=_job_feed_marker_to_iso(r.get("first_seen")),
            )
            for r in rows
        ],
    )


@router.get("/search/global", response_model=GlobalJobSearchResponse)
async def global_search_jobs(
    q: Annotated[str, Query(min_length=2, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> GlobalJobSearchResponse:
    """Public — trigram search across job_title + company_name. Powers ⌘K."""
    rows = repo.global_job_search(q, limit=limit)
    return GlobalJobSearchResponse(
        query=q,
        hits=[
            GlobalJobHit(
                job_id=str(r["job_id"]),
                job_title=r.get("job_title") or "",
                company_name=r.get("company_name"),
                location_city=r.get("location_city"),
                location_country=r.get("location_country"),
                location_mode=r.get("location_mode"),
                created_at=_job_feed_marker_to_iso(r.get("first_seen")),
            )
            for r in rows
        ],
    )


@router.post("/analytics/refresh-snapshot", response_model=AnalyticsSnapshotRefreshResponse)
async def refresh_analytics_snapshot(
    x_myro_refresh_secret: Annotated[str, Header(min_length=10)],
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> AnalyticsSnapshotRefreshResponse:
    """Recompile + persist the unfiltered analytics payload.

    Called by the scraper finalisation hook (sister repo) post-batch.
    Auth: shared secret via the X-Myro-Refresh-Secret header
    (env: MYRO_ANALYTICS_REFRESH_SECRET). Header, not query param, so the
    secret does not leak into HTTP access / reverse-proxy logs.
    Returns the new totals so the caller can log success.
    """
    import os
    import secrets as _secrets
    expected = os.environ.get("MYRO_ANALYTICS_REFRESH_SECRET", "").strip()
    if not expected or not _secrets.compare_digest(x_myro_refresh_secret, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid refresh secret")
    summary = repo.persist_analytics_snapshot(refreshed_by="batch-finalize")
    return AnalyticsSnapshotRefreshResponse(
        refreshed=True,
        total_jobs=summary["total_jobs"],
        total_companies=summary["total_companies"],
    )
