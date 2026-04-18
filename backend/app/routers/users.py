from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user
from app.schemas import (
    UpdateProfileRequest,
    UserProfileResponse,
    UserSkillsByDomainResponse,
)
from app.services.taxonomy_loader import lookup_by_name
from app.services.scoring_engine import _PROFICIENCY_TITLES

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: dict = Depends(get_current_user)) -> UserProfileResponse:
    result = (
        get_supabase_for_token(current_user["token"])
        .table("user_profiles")
        .select("*")
        .eq("id", current_user["user_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return UserProfileResponse(**result.data)


@router.get("/me/skills", response_model=UserSkillsByDomainResponse)
async def get_my_skills(current_user: dict = Depends(get_current_user)) -> UserSkillsByDomainResponse:
    """Returns the authenticated user's skills grouped by Lightcast taxonomy domain."""
    db = get_supabase_admin()
    result = (
        db.table("user_skills")
        .select("matched_level, proficiency_title, evidence_text, skills(taxonomy_key, display_name)")
        .eq("user_id", current_user["user_id"])
        .execute()
    )

    by_domain: dict[str, list[dict]] = {}   # L1 — for radar drill-down
    by_cluster: dict[str, list[dict]] = {}  # L2 — for CV page
    for row in result.data:
        if not row.get("skills"):
            continue
        skill = row["skills"]
        key = skill["taxonomy_key"]
        level = row["matched_level"]
        lc = lookup_by_name(key)
        item = {
            "key": key,
            "display_name": skill.get("display_name") or key,
            "level": level,
            "proficiency_title": row.get("proficiency_title") or _PROFICIENCY_TITLES.get(level, "Scout"),
            "evidence_text": row.get("evidence_text") or None,
        }
        l1 = (lc.l1_domain if lc else "") or "General"
        l2 = (lc.l2_cluster if lc else "") or "General"
        by_domain.setdefault(l1, []).append(item)
        by_cluster.setdefault(l2, []).append(item)

    for group in (by_domain, by_cluster):
        for key in group:
            group[key].sort(key=lambda x: x["level"], reverse=True)

    return UserSkillsByDomainResponse(by_domain=by_domain, by_cluster=by_cluster)


@router.put("/me/profile", response_model=UserProfileResponse)
async def update_profile(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")

    db = get_supabase_for_token(current_user["token"])
    db.table("user_profiles").update(updates).eq("id", current_user["user_id"]).execute()
    result = (
        db.table("user_profiles")
        .select("*")
        .eq("id", current_user["user_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return UserProfileResponse(**result.data)
