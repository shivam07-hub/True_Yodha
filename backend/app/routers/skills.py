from fastapi import APIRouter

from app.database import get_supabase_admin
from app.schemas import SkillResponse, SkillsListResponse

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=SkillsListResponse)
async def list_skills() -> SkillsListResponse:
    result = (
        get_supabase_admin()
        .table("skills")
        .select("id, taxonomy_key, display_name, lightcast_id, category, subcategory")
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
            category=row.get("category") or "General",
            subcategory=row.get("subcategory") or "General",
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
        .select("category")
        .eq("is_active", True)
        .execute()
    )
    domains = sorted({row["category"] for row in result.data if row.get("category")})
    return domains
