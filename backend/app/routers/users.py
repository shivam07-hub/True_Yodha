import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from supabase import Client

from app.deps import Principal, get_principal, get_user_db
from app.repositories.users import UsersRepository, get_token_users_repository
from app.schemas import (
    AccountDeletionResponse,
    FollowCompanyRequest,
    FollowedCompaniesResponse,
    PracticeSavesResponse,
    SavePracticeSkillRequest,
    SkillCorrectionRequest,
    SkillCorrectionResponse,
    SkillUpvoteItem,
    SkillUpvotesResponse,
    SkillUpvoteToggleRequest,
    SkillUpvoteToggleResponse,
    UpdateProfileRequest,
    UpdateProfileResponse,
    UserProfileResponse,
    UserSkillsByDomainResponse,
)
from app.services import followed_companies
from app.services import skill_correction, targeting_write
from app.services.job_eligibility import (
    career_band_for_profile,
    target_seniority_for_profile,
)
from app.services.xp_service import grant_linkedin_profile_xp
from app.services.account_deletion import delete_account
from app.services.taxonomy_loader import lookup_by_name

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)


@router.get("/me", response_model=UserProfileResponse)
def get_me(
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> UserProfileResponse:
    profile = users_repo.get_profile(principal.id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    profile["target_career_band"] = profile.get("target_career_band") or career_band_for_profile(profile) or None
    profile["target_seniority"] = target_seniority_for_profile(profile)
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


@router.delete("/me", response_model=AccountDeletionResponse)
async def delete_me(
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> AccountDeletionResponse:
    try:
        await run_in_threadpool(delete_account, principal.id, db)
    except Exception as exc:
        logger.error("Account deletion failed stage=server reason=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Account deletion could not be completed. Please retry.",
        ) from exc
    return AccountDeletionResponse(deleted=True)


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


@router.post("/me/skills/correction", response_model=SkillCorrectionResponse)
async def correct_my_skill(
    payload: SkillCorrectionRequest,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> SkillCorrectionResponse:
    """Drop a wrongly-extracted skill, or restore one previously dropped.

    The same control the first-run confirmation offers, kept available forever —
    a bad extraction spotted in month three should not need a CV re-upload
    (backlog #6). Recomputes the score in-band so the caller can show the new
    number rather than promising it will update later.
    """
    key = payload.skill_key.strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A skill is required.",
        )
    score = await run_in_threadpool(
        skill_correction.set_skill_included,
        db,
        principal.id,
        key,
        payload.included,
    )
    return SkillCorrectionResponse(
        skill_key=key,
        included=payload.included,
        total_score=float(score["total_score"]),
        skills_assessed=int(score.get("skills_assessed") or 0),
    )


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
    user_id = principal.id
    before = users_repo.get_profile(user_id) or {}

    # Derivation + the lean's routing live in targeting_write — the ONE way a
    # targeting patch reaches storage, shared with the signed-off pre-flight
    # order (POST /preflight/run). Two derivations of the same input would put
    # two directions in the cache-forever brain verdicts for one user.
    should_grant_linkedin_xp = _linkedin_reward_is_due(before, updates)
    profile = targeting_write.apply(users_repo, user_id, updates)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    profile["target_career_band"] = profile.get("target_career_band") or career_band_for_profile(profile) or None
    profile["target_seniority"] = target_seniority_for_profile(profile)

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
    rows = followed_companies.list_followed_companies(users_repo, principal.id)
    return FollowedCompaniesResponse(companies=rows, total=len(rows))


@router.post("/me/following/companies", status_code=status.HTTP_201_CREATED)
def follow_company(
    body: FollowCompanyRequest,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> dict:
    return followed_companies.follow_company(users_repo, principal.id, body.company_name)


@router.delete("/me/following/companies/{company_name}", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_company(
    company_name: str,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> None:
    followed_companies.unfollow_company(users_repo, principal.id, company_name)


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


# ── Skill upvotes: per-(skill, job) "I want to learn this" — the job-drawer
#    signal that orders Forge practice ("N of my jobs need this skill"). An
#    upvote also lands the skill in the practice queue so it is guaranteed to
#    appear in Forge; un-upvoting the last job removes only that auto-created
#    row, never a user-curated save. ──────────────────────────────────────────

_UPVOTE_PRACTICE_SOURCE = "job_upvote"


def _upvote_items(rows: list[dict]) -> list[SkillUpvoteItem]:
    """Aggregate raw (skill, job) rows into per-skill counts, most-upvoted first."""
    by_key: dict[str, SkillUpvoteItem] = {}
    for r in rows:
        key = (r.get("skill_key") or "").strip()
        job_id = r.get("job_id")
        if not key or not job_id:
            continue
        item = by_key.get(key)
        if item is None:
            by_key[key] = SkillUpvoteItem(
                skill_key=key,
                display_name=(r.get("display_name") or "").strip() or key,
                count=1,
                job_ids=[job_id],
            )
        elif job_id not in item.job_ids:
            item.job_ids.append(job_id)
            item.count += 1
    return sorted(by_key.values(), key=lambda i: -i.count)


@router.get("/me/skill-upvotes", response_model=SkillUpvotesResponse)
def get_skill_upvotes(
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> SkillUpvotesResponse:
    skills = _upvote_items(users_repo.list_skill_upvotes(principal.id))
    return SkillUpvotesResponse(skills=skills, total=len(skills))


@router.post("/me/skill-upvotes/toggle", response_model=SkillUpvoteToggleResponse)
def toggle_skill_upvote(
    body: SkillUpvoteToggleRequest,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> SkillUpvoteToggleResponse:
    skill_key = body.skill_key.strip()
    job_id = body.job_id.strip()
    if not skill_key or not job_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="skill_key and job_id required."
        )
    display_name = body.display_name.strip() or skill_key

    mine = {
        r["job_id"]
        for r in users_repo.list_skill_upvotes(principal.id)
        if (r.get("skill_key") or "").strip() == skill_key and r.get("job_id")
    }

    if job_id in mine:
        users_repo.remove_skill_upvote(principal.id, skill_key, job_id)
        count = len(mine) - 1
        if count <= 0:
            users_repo.remove_practice_save_if_source(
                principal.id, skill_key, _UPVOTE_PRACTICE_SOURCE
            )
        return SkillUpvoteToggleResponse(skill_key=skill_key, upvoted=False, count=max(0, count))

    users_repo.add_skill_upvote(principal.id, skill_key, display_name, job_id)
    users_repo.add_practice_save(principal.id, skill_key, display_name, _UPVOTE_PRACTICE_SOURCE)
    return SkillUpvoteToggleResponse(skill_key=skill_key, upvoted=True, count=len(mine) + 1)
