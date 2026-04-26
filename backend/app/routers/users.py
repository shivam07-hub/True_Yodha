from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.users import (
    UsersRepository,
    get_admin_users_repository,
    get_token_users_repository,
)
from app.schemas import (
    UpdateProfileRequest,
    UserProfileResponse,
    UserSkillsByDomainResponse,
)
from app.services.taxonomy_loader import lookup_by_name

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> UserProfileResponse:
    profile = users_repo.get_profile(current_user["user_id"])
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return UserProfileResponse(**profile)


@router.get("/me/skills", response_model=UserSkillsByDomainResponse)
async def get_my_skills(
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_admin_users_repository),
) -> UserSkillsByDomainResponse:
    """Returns the authenticated user's skills grouped by Lightcast taxonomy domain."""
    by_domain: dict[str, list[dict]] = {}   # L1 — for radar drill-down
    by_cluster: dict[str, list[dict]] = {}  # L2 — for CV page
    for record in users_repo.list_user_skill_records(current_user["user_id"]):
        lc = lookup_by_name(record.key)
        item = {
            "key": record.key,
            "display_name": record.display_name,
            "level": record.level,
            "proficiency_title": record.proficiency_title,
            "evidence_text": record.evidence_text,
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
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> UserProfileResponse:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")

    users_repo.update_profile(current_user["user_id"], updates)
    profile = users_repo.get_profile(current_user["user_id"])
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return UserProfileResponse(**profile)
