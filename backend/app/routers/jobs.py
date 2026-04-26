from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_public_jobs_repository, get_token_jobs_repository
from app.schemas import (
    ActionPlanDay,
    ApplicationResponse,
    ApplicationStatusUpdate,
    ComputeJobMatchesResponse,
    JobCVGenerateRequest,
    JobCVGenerateResponse,
    JobImportPreviewRequest,
    JobImportPreviewResponse,
    JobImportRequest,
    JobPathMilestoneResponse,
    JobPathMilestoneUpdate,
    JobPathResponse,
    JobPathTargetsRequest,
    JobMatchResponse,
    JobMatchesResponse,
    JobSearchResponse,
    MarketAnalyticsResponse,
    NameCountItem,
    SkillCountItem,
    SkillGapItem,
    SkillGapResponse,
    UserSkillDemandItem,
    UserSkillDemandResponse,
)
from app.schemas.jobs import JobSearchItem
from app.services import job_importer, job_matcher, job_path as job_path_service, llm_ranker
from app.services.rate_limit import assert_not_rate_limited
from app.services.scoring_engine import fetch_aspiration_skills

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _last_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


@router.get("/analytics", response_model=MarketAnalyticsResponse)
async def get_market_analytics(
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> MarketAnalyticsResponse:
    """Public endpoint — no auth. Aggregates stats from the raw jobs table."""
    rows = repo.fetch_analytics_rows()

    company_counts: Counter[str] = Counter()
    industry_counts: Counter[str] = Counter()
    skill_counts: Counter[str] = Counter()
    company_skill_counters: dict[str, Counter[str]] = {}
    industry_skill_counters: dict[str, Counter[str]] = {}
    batch_dates: list[int] = []

    for r in rows:
        company = r.get("company_name")
        industry = r.get("industry")
        skills = [s.strip() for s in (r.get("main_skills") or []) if s]

        if company:
            company_counts[company] += 1
            if company not in company_skill_counters:
                company_skill_counters[company] = Counter()
            company_skill_counters[company].update(skills)
        if industry:
            industry_counts[industry] += 1
            if industry not in industry_skill_counters:
                industry_skill_counters[industry] = Counter()
            industry_skill_counters[industry].update(skills)
        if r.get("batch_date"):
            batch_dates.append(r["batch_date"])
        for skill in skills:
            skill_counts[skill] += 1

    company_skills = {
        c: [s for s, _ in ctr.most_common(12)]
        for c, ctr in company_skill_counters.items()
    }
    industry_skills = {
        i: [s for s, _ in ctr.most_common(12)]
        for i, ctr in industry_skill_counters.items()
    }

    return MarketAnalyticsResponse(
        total_jobs=len(rows),
        total_companies=len(company_counts),
        total_industries=len(industry_counts),
        latest_batch=str(max(batch_dates)) if batch_dates else None,
        by_company=[NameCountItem(name=k, count=v) for k, v in company_counts.most_common()],
        by_industry=[NameCountItem(name=k, count=v) for k, v in industry_counts.most_common()],
        top_skills=[SkillCountItem(skill=k, count=v) for k, v in skill_counts.most_common(20)],
        company_skills=company_skills,
        industry_skills=industry_skills,
    )


@router.get("/search", response_model=JobSearchResponse)
async def search_jobs(
    company: str | None = None,
    skill: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> JobSearchResponse:
    """Public endpoint. Filter jobs by company name and/or skill (substring match on main_skills)."""
    rows = repo.search_jobs_by_filters(company, skill)
    items = [
        JobSearchItem(
            job_id=r["job_id"],
            job_title=r.get("job_title") or "",
            company_name=r.get("company_name"),
            job_description=r.get("job_description"),
        )
        for r in rows
    ]
    return JobSearchResponse(jobs=items, total=len(items))


@router.get("/my-skills/demand", response_model=UserSkillDemandResponse)
async def get_my_skill_demand(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> UserSkillDemandResponse:
    """
    Return market demand for skills already present in the user's CV.
    Sorted by weighted demand (main_skill×2 + side_skill×1), then raw job count.
    """
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

    weighted_demand: Counter[str] = Counter()
    job_count: Counter[str] = Counter()
    for row in repo.get_all_jobs_skills():
        seen_in_job: set[str] = set()

        for raw_skill in row.get("main_skills") or []:
            skill_key = (raw_skill or "").strip().lower()
            if skill_key and skill_key in user_skills:
                weighted_demand[skill_key] += 2
                seen_in_job.add(skill_key)

        for raw_skill in row.get("side_skills") or []:
            skill_key = (raw_skill or "").strip().lower()
            if skill_key and skill_key in user_skills:
                weighted_demand[skill_key] += 1
                seen_in_job.add(skill_key)

        for skill_key in seen_in_job:
            job_count[skill_key] += 1

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
    batch_week = _last_monday()
    rows = repo.get_user_matches_for_week(current_user["user_id"], batch_week)
    jobs = [_to_job_match(row, batch_week) for row in rows]
    return JobMatchesResponse(jobs=jobs, batch_week=batch_week, total=len(jobs))


@router.post("/compute", response_model=ComputeJobMatchesResponse)
async def compute_job_matches(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ComputeJobMatchesResponse:
    """
    Run the full job-matching pipeline for the current user:
      1. Load user's skill map from user_skills
      2. Score all active jobs by skill overlap
      3. Send top 10 to GPT-4o mini for re-ranking + explanations + action plans
      4. Persist results to user_job_matches (top 3 marked is_recommended=True)

    Cached per batch_week — skips LLM if already computed this week.
    """
    db = repo.client
    user_id = current_user["user_id"]
    batch_week = _last_monday()

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

    written = llm_ranker.rank_and_persist(db, user_id, batch_week, user_skill_map, top_jobs)

    return ComputeJobMatchesResponse(
        matches_written=written,
        from_cache=False,
        batch_week=batch_week,
    )


@router.get("/applications", response_model=list[ApplicationResponse])
async def get_applications(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> list[ApplicationResponse]:
    rows = repo.get_user_applications(current_user["user_id"])
    return [_to_application(row) for row in rows]


@router.post("/import/preview", response_model=JobImportPreviewResponse)
async def preview_job_import(
    body: JobImportPreviewRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobImportPreviewResponse:
    if not body.job_description.strip():
        raise HTTPException(
            status_code=422,
            detail="Job description is required.",
        )
    return JobImportPreviewResponse(**job_importer.preview_imported_job(repo.client, body))


@router.post("/import", response_model=ApplicationResponse)
async def import_job(
    body: JobImportRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    if not body.role_name.strip() or not body.job_description.strip():
        raise HTTPException(
            status_code=422,
            detail="Role name and job description are required.",
        )
    return ApplicationResponse(
        **job_importer.save_imported_job(repo.client, current_user["user_id"], body)
    )


@router.get("/applications/{job_id}/path", response_model=JobPathResponse)
async def get_application_path(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobPathResponse:
    return JobPathResponse(
        **job_path_service.get_application_path(repo.client, current_user["user_id"], job_id)
    )


@router.put("/applications/{job_id}/targets", response_model=JobPathResponse)
async def replace_application_targets(
    job_id: str,
    body: JobPathTargetsRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobPathResponse:
    return JobPathResponse(
        **job_path_service.replace_skill_targets(
            repo.client,
            current_user["user_id"],
            job_id,
            [target.model_dump() for target in body.targets],
        )
    )


@router.put("/applications/{job_id}/milestones/{milestone_id}", response_model=JobPathMilestoneResponse)
async def update_application_milestone(
    job_id: str,
    milestone_id: str,
    body: JobPathMilestoneUpdate,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobPathMilestoneResponse:
    return JobPathMilestoneResponse(
        **job_path_service.update_milestone(repo.client, current_user["user_id"], job_id, milestone_id, body)
    )


@router.post("/applications/{job_id}/cv", response_model=JobCVGenerateResponse, status_code=status.HTTP_201_CREATED)
async def generate_application_cv(
    job_id: str,
    body: JobCVGenerateRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobCVGenerateResponse:
    return JobCVGenerateResponse(
        **job_path_service.generate_job_cv(repo.client, current_user["user_id"], job_id, ai_polish=body.ai_polish)
    )


@router.put("/applications/{job_id}", response_model=ApplicationResponse)
async def update_application(
    job_id: str,
    body: ApplicationStatusUpdate,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    valid_statuses = {"pending", "applied", "no_response", "responded", "interviewing", "rejected", "offer", "abandoned"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {body.status}")

    updates: dict = {"status": body.status}
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.company_response is not None:
        updates["company_response"] = body.company_response
    if body.status == "applied":
        updates["applied_at"] = datetime.now(timezone.utc).isoformat()
    if body.status in {"responded", "interviewing", "rejected", "offer"}:
        updates["response_at"] = datetime.now(timezone.utc).isoformat()
    if body.status == "offer":
        updates["offer_received_at"] = datetime.now(timezone.utc).isoformat()
    if body.status == "abandoned":
        updates["closed_at"] = datetime.now(timezone.utc).isoformat()
    if body.followed_up:
        updates["followed_up_at"] = datetime.now(timezone.utc).isoformat()

    user_id = current_user["user_id"]
    repo.upsert_application(user_id, job_id, updates)
    data = repo.get_application_with_job(user_id, job_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return _to_application(data)


@router.delete("/tracker/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tracker_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    repo.delete_tracker_rows(current_user["user_id"], job_id)


@router.get("/{job_id}/skill-gap", response_model=SkillGapResponse)
async def get_skill_gap(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> SkillGapResponse:
    """Return per-job skill gap: which skills the job requires and whether the user has them."""
    job = repo.get_job_skills(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    main_skills = [s.strip() for s in (job.get("main_skills") or []) if s and s.strip()]
    side_skills = [s.strip() for s in (job.get("side_skills") or []) if s and s.strip()]

    user_skill_map = repo.get_user_skill_map(current_user["user_id"])

    gap_items: list[SkillGapItem] = []
    for skill in main_skills:
        level = user_skill_map.get(skill.lower())
        gap_items.append(SkillGapItem(skill=skill, is_primary=True, user_level=level, missing=level is None))
    for skill in side_skills:
        level = user_skill_map.get(skill.lower())
        gap_items.append(SkillGapItem(skill=skill, is_primary=False, user_level=level, missing=level is None))

    total = len(gap_items)
    missing_count = sum(1 for g in gap_items if g.missing)
    gap_pct = round(missing_count / total * 100) if total else 0

    return SkillGapResponse(
        job_id=job_id,
        job_title=job.get("job_title") or "",
        company=job.get("company_name"),
        skills=gap_items,
        gap_pct=gap_pct,
        total_required=total,
        missing_count=missing_count,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_job_match(row: dict, batch_week: date) -> JobMatchResponse:
    job = row.get("jobs") or {}
    action_plan = [ActionPlanDay(**d) for d in (row.get("action_plan") or [])]
    return JobMatchResponse(
        id=row["id"],
        job_id=row["job_id"],
        title=job.get("job_title") or "",
        company=job.get("company_name"),
        location=job.get("location"),
        industry=job.get("industry"),
        remote=False,
        overlap_score=row.get("overlap_score", 0),
        llm_rank=row.get("llm_rank"),
        llm_explanation=row.get("llm_explanation"),
        action_plan=action_plan,
        batch_week=batch_week,
        source_url=job.get("apply_url"),
        matched_skills=row.get("matched_skills") or [],
        job_description=job.get("job_description"),
    )


def _to_application(row: dict) -> ApplicationResponse:
    job = row.get("jobs") or {}
    return ApplicationResponse(
        id=row["id"],
        job_id=row["job_id"],
        title=job.get("job_title") or "",
        company=job.get("company_name"),
        job_description=job.get("job_description"),
        status=row["status"],
        applied_at=row.get("applied_at"),
        response_at=row.get("response_at"),
        checkin_sent_at=row.get("checkin_sent_at"),
        followed_up_at=row.get("followed_up_at"),
        closed_at=row.get("closed_at"),
        offer_received_at=row.get("offer_received_at"),
        notes=row.get("notes"),
        created_at=row["created_at"],
    )
