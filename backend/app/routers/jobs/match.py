from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    ComputeJobMatchesResponse,
    JobMatchesResponse,
    UserSkillDemandItem,
    UserSkillDemandResponse,
)
from app.services import job_matcher, llm_ranker
from app.services.llm_provider import LLMProvider, get_llm_provider
from app.services.rate_limit import assert_not_rate_limited
from app.services.scoring_engine import fetch_aspiration_skills

from ._shared import last_monday, to_job_match

router = APIRouter()


@router.get("/my-skills/demand", response_model=UserSkillDemandResponse)
async def get_my_skill_demand(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> UserSkillDemandResponse:
    user_id = current_user["user_id"]

    user_skills: dict[str, dict] = {}
    for row in repo.get_user_skills_with_taxonomy(user_id):
        skill = row.get("skills")
        if not skill:
            continue
        key = (skill.get("taxonomy_key") or "").strip()
        if not key:
            continue
        user_skills[key.lower()] = {
            "skill": key,
            "display_name": (skill.get("display_name") or key).strip() or key,
            "current_level": int(row.get("matched_level") or 0),
            "proficiency_title": row.get("proficiency_title") or "Scout",
        }

    if not user_skills:
        return UserSkillDemandResponse(skills=[], total=0)

    weighted_demand: dict[str, int] = {}
    job_count: dict[str, int] = {}
    for row in repo.get_all_jobs_skills():
        seen_in_job: set[str] = set()

        for raw_skill in row.get("main_skills") or []:
            skill_key = (raw_skill or "").strip().lower()
            if skill_key and skill_key in user_skills:
                weighted_demand[skill_key] = weighted_demand.get(skill_key, 0) + 2
                seen_in_job.add(skill_key)

        for raw_skill in row.get("side_skills") or []:
            skill_key = (raw_skill or "").strip().lower()
            if skill_key and skill_key in user_skills:
                weighted_demand[skill_key] = weighted_demand.get(skill_key, 0) + 1
                seen_in_job.add(skill_key)

        for skill_key in seen_in_job:
            job_count[skill_key] = job_count.get(skill_key, 0) + 1

    target_roles = repo.get_user_target_roles(user_id)
    aspiration = fetch_aspiration_skills(repo.client, target_roles)
    aspiration_by_key = {key.lower(): level for key, level in aspiration.items()}

    items: list[UserSkillDemandItem] = []
    for skill_key, skill_meta in user_skills.items():
        current_level = skill_meta["current_level"]
        target_level = aspiration_by_key.get(skill_key)
        needs_upgrade = target_level is not None and current_level < target_level
        items.append(
            UserSkillDemandItem(
                skill=skill_meta["skill"],
                display_name=skill_meta["display_name"],
                current_level=current_level,
                proficiency_title=skill_meta["proficiency_title"],
                target_level=target_level,
                needs_upgrade=needs_upgrade,
                job_count_30d=job_count.get(skill_key, 0),
                weighted_demand=weighted_demand.get(skill_key, 0),
            )
        )

    items.sort(
        key=lambda item: (
            -item.weighted_demand,
            -item.job_count_30d,
            -item.current_level,
            item.display_name.lower(),
        ),
    )
    return UserSkillDemandResponse(skills=items, total=len(items))


@router.get("/matches", response_model=JobMatchesResponse)
async def get_job_matches(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobMatchesResponse:
    batch_week = last_monday()
    rows = repo.get_user_matches_for_week(current_user["user_id"], batch_week)
    jobs = [to_job_match(row, batch_week) for row in rows]
    return JobMatchesResponse(jobs=jobs, batch_week=batch_week, total=len(jobs))


@router.post("/compute", response_model=ComputeJobMatchesResponse)
async def compute_job_matches(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    llm_provider: LLMProvider = Depends(get_llm_provider),
) -> ComputeJobMatchesResponse:
    db = repo.client
    user_id = current_user["user_id"]
    batch_week = last_monday()
    assert_not_rate_limited(db, user_id, "user_job_matches", "computed_at")

    if llm_ranker.is_cache_valid(db, user_id, batch_week):
        return ComputeJobMatchesResponse(
            matches_written=0,
            from_cache=True,
            batch_week=batch_week,
        )

    skill_rows = repo.get_user_skill_rows(user_id)
    if not skill_rows:
        return ComputeJobMatchesResponse(
            matches_written=0,
            from_cache=False,
            batch_week=batch_week,
            needs_onboarding=True,
        )

    user_skill_map: dict[str, int] = {
        row["skills"]["taxonomy_key"]: row["matched_level"]
        for row in skill_rows
        if row.get("skills")
    }
    profile = repo.get_user_profile_targeting(user_id)
    top_jobs = job_matcher.get_top_matches(
        db,
        user_skill_map,
        target_roles=profile.get("target_roles") or [],
        target_location=profile.get("target_location"),
        top_n=10,
    )
    if not top_jobs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tagged job postings found. Complete job tagging first.",
        )

    written = await llm_ranker.rank_and_persist(
        db,
        user_id,
        batch_week,
        user_skill_map,
        top_jobs,
        llm_provider,
    )
    return ComputeJobMatchesResponse(
        matches_written=written,
        from_cache=False,
        batch_week=batch_week,
    )
