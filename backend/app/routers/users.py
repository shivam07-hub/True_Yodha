from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.repositories.users import UsersRepository, get_token_users_repository
from app.schemas import (
    FollowCompanyRequest,
    FollowedCompaniesResponse,
    PracticeSavesResponse,
    SavePracticeSkillRequest,
    UpdateProfileRequest,
    UpdateProfileResponse,
    UserProfileResponse,
    UserSkillsByDomainResponse,
)
from app.services.xp_policy import (
    FOLLOW_COMPANY_XP_COST,
    FOLLOW_COMPANY_XP_FLOOR,
    FOLLOWED_COMPANY_LIMIT,
)
from app.services import onboarding_service
from app.services.xp_service import grant_linkedin_profile_xp, spend_xp_to_floor
from app.services.taxonomy_loader import lookup_by_name

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileResponse)
def get_me(
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> UserProfileResponse:
    profile = users_repo.get_profile(principal.id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    has_cv = users_repo.has_baseline_cv(principal.id)
    profile["has_cv"] = has_cv
    profile["cv_readiness"] = "ready" if has_cv else "missing"
    profile["cv_upload_job_id"] = None
    profile["cv_upload_error_code"] = None

    # Optional seam: older test fakes may not implement this repository method.
    latest_job = users_repo.latest_cv_upload_job(principal.id) if hasattr(users_repo, "latest_cv_upload_job") else None
    if not has_cv and latest_job:
        status_value = str(latest_job.get("status") or "").strip().lower()
        profile["cv_upload_job_id"] = str(latest_job.get("id") or "") or None
        if status_value == "processing":
            profile["cv_readiness"] = "processing"
        elif status_value == "failed":
            profile["cv_readiness"] = "failed"
            profile["cv_upload_error_code"] = latest_job.get("error_code")

    return UserProfileResponse(**profile)


@router.get("/me/skills", response_model=UserSkillsByDomainResponse)
def get_my_skills(
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> UserSkillsByDomainResponse:
    """Returns the authenticated user's skills grouped by Lightcast taxonomy domain."""
    by_domain: dict[str, list[dict]] = {}   # L1 — for radar drill-down
    by_cluster: dict[str, list[dict]] = {}  # L2 — for CV page
    for record in users_repo.list_user_skill_records(principal.id):
        lc = lookup_by_name(record.key)
        item = {
            "key": record.key,
            "display_name": record.display_name,
            "level": record.level,
            "proficiency_title": record.proficiency_title,
            "description": record.description,
            "evidence_text": record.evidence_text,
            "forge_sessions_count": record.forge_sessions_count,
            "forged_level_up_available": record.forged_level_up_available,
        }
        l1 = (lc.l1_domain if lc else "") or "General"
        l2 = (lc.l2_cluster if lc else "") or "General"
        by_domain.setdefault(l1, []).append(item)
        by_cluster.setdefault(l2, []).append(item)

    for group in (by_domain, by_cluster):
        for key in group:
            group[key].sort(key=lambda x: x["level"], reverse=True)

    return UserSkillsByDomainResponse(by_domain=by_domain, by_cluster=by_cluster)


def _linkedin_reward_is_due(before: dict | None, updates: dict) -> bool:
    if "linkedin_url" not in updates:
        return False
    if not str(updates.get("linkedin_url") or "").strip():
        return False
    if before and before.get("linkedin_coins_granted"):
        return False
    if before and str(before.get("linkedin_url") or "").strip():
        return False
    return True


@router.put("/me/profile", response_model=UpdateProfileResponse)
async def update_profile(
    body: UpdateProfileRequest,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> UpdateProfileResponse:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")

    # Target-role edits arrive as human TITLES; the taxonomy-cluster union
    # (`target_roles`, the matcher read model) is always derived — one writer,
    # no split-brain with intent-chat / onboarding (both ride save_target's
    # same derivation). A raw `target_roles` sent alongside titles is ignored.
    if "target_role_titles" in updates:
        updates.pop("target_roles", None)
        updates.pop("target_role_title", None)
        updates.update(onboarding_service.role_title_updates(updates.pop("target_role_titles")))

    user_id = principal.id
    before = users_repo.get_profile(user_id)
    should_grant_linkedin_xp = _linkedin_reward_is_due(before, updates)
    users_repo.update_profile(user_id, updates)
    profile = users_repo.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    coins_earned = 0
    new_coin_balance = None
    if should_grant_linkedin_xp:
        coins_earned, new_coin_balance = await grant_linkedin_profile_xp(user_id)

    return UpdateProfileResponse(**profile, coins_earned=coins_earned, new_coin_balance=new_coin_balance)


@router.get("/me/following/companies", response_model=FollowedCompaniesResponse)
def get_followed_companies(
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> FollowedCompaniesResponse:
    rows = users_repo.get_followed_companies(principal.id)
    return FollowedCompaniesResponse(companies=rows, total=len(rows))


_FOLLOW_XP_COST = FOLLOW_COMPANY_XP_COST
_MAX_FOLLOWED = FOLLOWED_COMPANY_LIMIT


def _company_key(name: str) -> str:
    return " ".join(name.casefold().split())


@router.post("/me/following/companies", status_code=status.HTTP_201_CREATED)
async def follow_company(
    body: FollowCompanyRequest,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> dict:
    name = body.company_name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="company_name required.")

    existing = users_repo.get_followed_companies(principal.id)
    existing_by_key = {_company_key(r["company_name"]): r for r in existing}
    already_following = existing_by_key.get(_company_key(name))

    if already_following:
        return {"company_name": already_following["company_name"], "new_coin_balance": None}

    if len(existing) >= _MAX_FOLLOWED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Follow limit reached — max {_MAX_FOLLOWED} companies.",
        )

    new_balance = await spend_xp_to_floor(
        principal.id,
        _FOLLOW_XP_COST,
        "follow_company",
        floor=FOLLOW_COMPANY_XP_FLOOR,
    )
    users_repo.follow_company(principal.id, name)
    return {"company_name": name, "new_coin_balance": new_balance}


@router.delete("/me/following/companies/{company_name}", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_company(
    company_name: str,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> None:
    users_repo.unfollow_company(principal.id, company_name)


# ── Practice saves: a user-curated queue of skills to practice in Forge ───────

_PRACTICE_SOURCES = {"gap_session", "market", "skills", "job_detail", "manual", "other"}


@router.get("/me/practice-saves", response_model=PracticeSavesResponse)
def get_practice_saves(
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> PracticeSavesResponse:
    rows = users_repo.list_practice_saves(principal.id)
    return PracticeSavesResponse(skills=rows, total=len(rows))


@router.post("/me/practice-saves", status_code=status.HTTP_201_CREATED)
def save_practice_skill(
    body: SavePracticeSkillRequest,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> dict:
    skill_key = body.skill_key.strip()
    if not skill_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="skill_key required.")
    source = body.source if body.source in _PRACTICE_SOURCES else "other"
    display_name = body.display_name.strip() or skill_key
    users_repo.add_practice_save(principal.id, skill_key, display_name, source)
    return {"skill_key": skill_key}


@router.delete("/me/practice-saves/{skill_key}", status_code=status.HTTP_204_NO_CONTENT)
def remove_practice_skill(
    skill_key: str,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> None:
    users_repo.remove_practice_save(principal.id, skill_key)
