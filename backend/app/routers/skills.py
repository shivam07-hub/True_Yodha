from fastapi import APIRouter, HTTPException, status

from app.database import get_supabase_admin
from app.schemas import DomainsListResponse, SkillDomainResponse, SkillLevelResponse, SkillResponse, SkillsListResponse

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=SkillsListResponse)
async def list_skills() -> SkillsListResponse:
    result = (
        get_supabase_admin()
        .table("skills")
        .select("*, skill_domains(code), skill_families(code), skill_levels(*)")
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    skills = [_to_skill_response(row) for row in result.data]
    return SkillsListResponse(skills=skills, total=len(skills))


@router.get("/domains", response_model=DomainsListResponse)
async def list_domains() -> DomainsListResponse:
    domains_result = (
        get_supabase_admin()
        .table("skill_domains")
        .select("*, skills(*, skill_families(code), skill_levels(*))")
        .order("sort_order")
        .execute()
    )
    domains = [_to_domain_response(row) for row in domains_result.data]
    return DomainsListResponse(domains=domains)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_skill_response(row: dict) -> SkillResponse:
    levels = [
        SkillLevelResponse(
            level=lvl["level"],
            label=lvl["label"],
            description=lvl["description"],
        )
        for lvl in sorted(row.get("skill_levels", []), key=lambda x: x["level"])
    ]
    return SkillResponse(
        id=row["id"],
        taxonomy_key=row["taxonomy_key"],
        display_name=row["display_name"],
        domain_code=row.get("skill_domains", {}).get("code", ""),
        family_code=row.get("skill_families", {}).get("code", ""),
        demand_trend=row.get("demand_trend", "stable"),
        levels=levels,
    )


def _to_domain_response(row: dict) -> SkillDomainResponse:
    skills = [
        SkillResponse(
            id=s["id"],
            taxonomy_key=s["taxonomy_key"],
            display_name=s["display_name"],
            domain_code=row["code"],
            family_code=s.get("skill_families", {}).get("code", ""),
            demand_trend=s.get("demand_trend", "stable"),
            levels=[
                SkillLevelResponse(level=lvl["level"], label=lvl["label"], description=lvl["description"])
                for lvl in sorted(s.get("skill_levels", []), key=lambda x: x["level"])
            ],
        )
        for s in sorted(row.get("skills", []), key=lambda x: x.get("sort_order", 0))
        if s.get("is_active", True)
    ]
    return SkillDomainResponse(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row.get("description"),
        skills=skills,
    )
