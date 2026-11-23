"""GET /partner/v1/market/* — what the market asks for, with no person in it.

Scope `market.read`. The first holder is Myro's own open MCP door
(ARCHITECTURE_MCP.md §3A), whose callers arrive through Anthropic's and
OpenAI's servers and so cannot be told apart by IP: the per-key Redis limiter
in `partner_auth` is the ceiling that holds. Not metered — the paid feed is
`/partner/v1/roles` under `roles.read`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.database import get_supabase_admin
from app.repositories.jobs import get_public_jobs_repository
from app.repositories.partners import PartnerCredential
from app.repositories.role_families import RoleFamiliesRepository, rank_families
from app.schemas.market import (
    MarketJob,
    MarketJobsResponse,
    RoleFamilySkills,
    RoleSkillsResponse,
    WorkMode,
)
from app.security.partner_auth import SCOPE_MARKET_READ, require_scope
from app.services import shared_cache
from app.services.listing_time import day
from app.services.matching.filter_spec import FilterSpec
from app.services.matching.job_query import JobQuery

router = APIRouter(prefix="/market")

_MAX_JOBS = 20
_MAX_FAMILIES = 5
# The family snapshot is rebuilt by a daily refresh; reading all 337 rows took
# 660-950ms from a laptop on 2026-11-22. Same shape as the ghost index: a reader
# never waits on the rebuild.
_FAMILIES_TTL_SECONDS = 900
_FAMILIES_STALE_SECONDS = 86_400


@router.get("/jobs", response_model=MarketJobsResponse)
def market_jobs(
    role: str = Query(..., min_length=2, max_length=120, description="Role or title words, e.g. 'product manager'."),
    city: str | None = Query(default=None, max_length=80),
    country: str | None = Query(default=None, max_length=80),
    mode: WorkMode | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=_MAX_JOBS),
    _partner: PartnerCredential = Depends(require_scope(SCOPE_MARKET_READ)),
) -> MarketJobsResponse:
    """Live roles by role words and place — the landing search without its
    model parse. The caller is an assistant: it has already parsed the person's
    sentence, so paying a model to parse it again buys nothing."""
    spec = FilterSpec(
        roles=(" ".join(role.split()),),
        location_city=city,
        location_country=country,
        location_mode=mode,
        limit=limit,
    )
    result = JobQuery.public(get_public_jobs_repository(), spec)
    return MarketJobsResponse(
        jobs=[
            MarketJob(
                job_id=str(row["job_id"]),
                title=row.get("job_title") or "",
                company=row.get("company_name"),
                location_city=row.get("location_city"),
                location_country=row.get("location_country"),
                work_mode=row.get("location_mode"),
                first_seen=day(row.get("first_seen")),
            )
            for row in result["rows"]
            if row.get("job_id")
        ],
        total=int(result["total"]),
        relaxed=list(result["relaxed"]),
    )


@router.get("/role-skills", response_model=RoleSkillsResponse)
def market_role_skills(
    role: str = Query(..., min_length=2, max_length=120, description="Role or field words, e.g. 'data scientist'."),
    limit: int = Query(default=3, ge=1, le=_MAX_FAMILIES),
    _partner: PartnerCredential = Depends(require_scope(SCOPE_MARKET_READ)),
) -> RoleSkillsResponse:
    """The skills live listings in a role's family ask for most, and how many
    of those listings are open. A role whose words name no family answers with
    no families — an empty answer, not a missing one."""
    corpus = shared_cache.get_or_compute(
        "market_named_families",
        lambda: RoleFamiliesRepository(get_supabase_admin()).named_families(),
        ttl_seconds=_FAMILIES_TTL_SECONDS,
        stale_seconds=_FAMILIES_STALE_SECONDS,
    )
    rows = rank_families(role, corpus, limit=limit)
    refreshed = [row["refreshed_at"] for row in rows if row.get("refreshed_at")]
    return RoleSkillsResponse(
        role=role,
        families=[
            RoleFamilySkills(
                family=str(row["family"]),
                open_roles=int(row.get("open_count") or 0),
                core_skills=[str(s) for s in (row.get("core_skills") or [])],
            )
            for row in rows
        ],
        refreshed_at=max(refreshed) if refreshed else None,
    )
