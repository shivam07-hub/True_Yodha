from fastapi import APIRouter

from app.database import get_supabase_admin
from app.schemas import SkillResponse, SkillsListResponse

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=SkillsListResponse)
async def list_skills() -> SkillsListResponse:
    result = (
        get_supabase_admin()
        .table("skills")
        .select("id, taxonomy_key, display_name, lightcast_id, l1_domain, l2_cluster")
        .eq("is_active", True)
        .order("display_name")
        .execute()
    )
    skills = [
        SkillResponse(
            id=row["id"],
            taxonomy_key=row["taxonomy_key"],
            display_name=row["display_name"],
            lightcast_id=row.get("lightcast_id"),
            l1_domain=row.get("l1_domain") or "General",
            l2_cluster=row.get("l2_cluster") or "General",
        )
        for row in result.data
    ]
    return SkillsListResponse(skills=skills, total=len(skills))


@router.get("/domains", response_model=list[str])
async def list_domains() -> list[str]:
    """Returns distinct L1 category names present in the skills table."""
    result = (
        get_supabase_admin()
        .table("skills")
        .select("l1_domain")
        .eq("is_active", True)
        .execute()
    )
    domains = sorted({row["l1_domain"] for row in result.data if row.get("l1_domain")})
    return domains
