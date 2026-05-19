from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.diary import DiaryRepository, get_token_diary_repository
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.repositories.users import UsersRepository, get_token_users_repository
from app.schemas import (
    FollowCompanyRequest,
    FollowedCompaniesResponse,
    SkillAdviceRequest,
    SkillAdviceResponse,
    SkillLevelCorrectionRequest,
    SkillLevelCorrectionResponse,
    UpdateProfileRequest,
    UpdateProfileResponse,
    UserProfileResponse,
    UserSkillsByDomainResponse,
)
from app.services.scoring import recompute_score
from app.services.skill_advice import generate_skill_advice
from app.services.llm_provider import LLMProvider, get_llm_provider
from app.services.xp_policy import (
    FOLLOW_COMPANY_XP_COST,
    FOLLOW_COMPANY_XP_FLOOR,
    FOLLOWED_COMPANY_LIMIT,
    SKILL_ADVICE_XP_COST,
)
from app.services.xp_service import assert_can_spend_xp, get_xp_balance, grant_linkedin_profile_xp, spend_xp, spend_xp_to_floor
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
    users_repo: UsersRepository = Depends(get_token_users_repository),
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


@router.patch("/me/skills/{taxonomy_key}/level", response_model=SkillLevelCorrectionResponse)
async def correct_skill_level(
    taxonomy_key: str,
    body: SkillLevelCorrectionRequest,
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_token_users_repository),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> SkillLevelCorrectionResponse:
    user_id = current_user["user_id"]
    skill_id = users_repo.get_skill_id_by_taxonomy_key(taxonomy_key)
    if skill_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Skill '{taxonomy_key}' not found in taxonomy.")

    users_repo.correct_skill_level(user_id, skill_id, body.level)

    score_row = recompute_score(scores_repo, user_id)

    return SkillLevelCorrectionResponse(
        taxonomy_key=taxonomy_key,
        new_level=body.level,
        total_score=score_row.get("total_score"),
    )


_SKILL_ADVICE_XP_COST = SKILL_ADVICE_XP_COST


@router.post("/me/skills/level-up-advice", response_model=SkillAdviceResponse)
async def get_skill_level_up_advice(
    body: SkillAdviceRequest,
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_token_users_repository),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
    llm_provider: LLMProvider = Depends(get_llm_provider),
) -> SkillAdviceResponse:
    user_id = current_user["user_id"]
    if body.free_unlock:
        if not users_repo.has_forged_level_up(user_id, body.taxonomy_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No forged level-up is available for this skill.",
            )
        diary_context = _recent_diary_context(diary_repo, user_id)
        evidence_text = "\n\n".join(part for part in [body.evidence_text.strip(), diary_context] if part)
    else:
        evidence_text = body.evidence_text.strip()

    if not evidence_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Skill advice needs CV evidence before XP can be spent.",
        )
    if not body.free_unlock:
        await assert_can_spend_xp(user_id, _SKILL_ADVICE_XP_COST, "skill_advice")
    advice = await generate_skill_advice(
        skill=body.taxonomy_key,
        current_level=body.current_level,
        evidence_text=evidence_text,
        provider=llm_provider,
    )
    if not advice:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Skill advice is unavailable right now. No XP was spent.",
        )
    if body.free_unlock:
        new_balance = await get_xp_balance(user_id)
        return SkillAdviceResponse(advice=advice, xp_spent=0, new_xp_balance=new_balance)
    new_balance = await spend_xp(user_id, _SKILL_ADVICE_XP_COST, "skill_advice")
    return SkillAdviceResponse(advice=advice, xp_spent=_SKILL_ADVICE_XP_COST, new_xp_balance=new_balance)


def _recent_diary_context(diary_repo: DiaryRepository, user_id: str) -> str:
    rows = diary_repo.list_daily_logs(user_id, 5)
    notes = [str(row.get("entry_text") or "").strip()[:800] for row in rows]
    notes = [note for note in notes if note]
    if not notes:
        return ""
    return "Recent diary notes:\n" + "\n".join(f"- {note}" for note in notes)


def _linkedin_reward_is_due(before: dict | None, updates: dict) -> bool:
    if "linkedin_url" not in updates:
        return False
    if not str(updates.get("linkedin_url") or "").strip():
        return False
    if before and before.get("linkedin_xp_granted"):
        return False
    if before and str(before.get("linkedin_url") or "").strip():
        return False
    return True


@router.put("/me/profile", response_model=UpdateProfileResponse)
async def update_profile(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> UpdateProfileResponse:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")

    user_id = current_user["user_id"]
    before = users_repo.get_profile(user_id)
    should_grant_linkedin_xp = _linkedin_reward_is_due(before, updates)
    users_repo.update_profile(user_id, updates)
    profile = users_repo.get_profile(current_user["user_id"])
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    xp_earned = 0
    new_xp_balance = None
    if should_grant_linkedin_xp:
        xp_earned, new_xp_balance = await grant_linkedin_profile_xp(user_id)

    return UpdateProfileResponse(**profile, xp_earned=xp_earned, new_xp_balance=new_xp_balance)


@router.get("/me/following/companies", response_model=FollowedCompaniesResponse)
async def get_followed_companies(
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> FollowedCompaniesResponse:
    rows = users_repo.get_followed_companies(current_user["user_id"])
    return FollowedCompaniesResponse(companies=rows, total=len(rows))


_FOLLOW_XP_COST = FOLLOW_COMPANY_XP_COST
_MAX_FOLLOWED = FOLLOWED_COMPANY_LIMIT


def _company_key(name: str) -> str:
    return " ".join(name.casefold().split())


@router.post("/me/following/companies", status_code=status.HTTP_201_CREATED)
async def follow_company(
    body: FollowCompanyRequest,
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> dict:
    name = body.company_name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="company_name required.")

    existing = users_repo.get_followed_companies(current_user["user_id"])
    existing_by_key = {_company_key(r["company_name"]): r for r in existing}
    already_following = existing_by_key.get(_company_key(name))

    if already_following:
        return {"company_name": already_following["company_name"], "new_xp_balance": None}

    if len(existing) >= _MAX_FOLLOWED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Follow limit reached — max {_MAX_FOLLOWED} companies.",
        )

    new_balance = await spend_xp_to_floor(
        current_user["user_id"],
        _FOLLOW_XP_COST,
        "follow_company",
        floor=FOLLOW_COMPANY_XP_FLOOR,
    )
    users_repo.follow_company(current_user["user_id"], name)
    return {"company_name": name, "new_xp_balance": new_balance}


@router.delete("/me/following/companies/{company_name}", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_company(
    company_name: str,
    current_user: dict = Depends(get_current_user),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> None:
    users_repo.unfollow_company(current_user["user_id"], company_name)
