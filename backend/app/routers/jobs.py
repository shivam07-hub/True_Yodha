from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user
from app.schemas import (
    ActionPlanDay,
    ApplicationResponse,
    ApplicationStatusUpdate,
    ComputeJobMatchesResponse,
    JobMatchResponse,
    JobMatchesResponse,
    JobSearchResponse,
    MarketAnalyticsResponse,
    NameCountItem,
    SkillCountItem,
    SkillGapItem,
    SkillGapResponse,
)
from app.services import job_matcher, llm_ranker
from app.services.rate_limit import assert_not_rate_limited

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _last_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


@router.get("/analytics", response_model=MarketAnalyticsResponse)
async def get_market_analytics() -> MarketAnalyticsResponse:
    """Public endpoint — no auth. Aggregates stats from the raw jobs table."""
    db = get_supabase_admin()
    cols = "company_name, industry, main_skills, batch_date"
    # Supabase caps at 1000 rows per request — paginate to get everything
    page1 = db.table("jobs").select(cols).range(0, 999).execute().data
    page2 = db.table("jobs").select(cols).range(1000, 9999).execute().data
    rows = page1 + page2

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
async def search_jobs(company: str | None = None, skill: str | None = None) -> JobSearchResponse:
    """Public endpoint. Filter jobs by company name and/or skill (substring match on main_skills)."""
    from app.schemas.jobs import JobSearchItem
    db = get_supabase_admin()
    query = db.table("jobs").select("job_id, job_title, company_name, job_description")
    if company:
        query = query.eq("company_name", company)
    rows = query.limit(200).execute().data
    if skill:
        skill_lower = skill.lower()
        rows = [
            r for r in rows
            if any(skill_lower in (s or "").lower() for s in (r.get("main_skills") or []))
        ]
    items = [
        JobSearchItem(
            job_id=r["job_id"],
            job_title=r.get("job_title") or "",
            company_name=r.get("company_name"),
            job_description=r.get("job_description"),
        )
        for r in rows[:50]
    ]
    return JobSearchResponse(jobs=items, total=len(items))


@router.get("/matches", response_model=JobMatchesResponse)
async def get_job_matches(current_user: dict = Depends(get_current_user)) -> JobMatchesResponse:
    batch_week = _last_monday()
    # Admin client so the join to `jobs` table works regardless of its RLS policy.
    # user_id filter below enforces row-level security manually.
    db = get_supabase_admin()

    result = (
        db.table("user_job_matches")
        .select(
            "id, job_id, overlap_score, llm_rank, llm_explanation, is_recommended, action_plan, batch_week, computed_at, matched_skills,"
            "jobs(job_title, company_name, industry, location, apply_url, job_description)"
        )
        .eq("user_id", current_user["user_id"])
        .eq("batch_week", str(batch_week))
        .order("llm_rank")
        .execute()
    )

    jobs = [_to_job_match(row, batch_week) for row in result.data]
    return JobMatchesResponse(jobs=jobs, batch_week=batch_week, total=len(jobs))


@router.post("/compute", response_model=ComputeJobMatchesResponse)
async def compute_job_matches(
    current_user: dict = Depends(get_current_user),
) -> ComputeJobMatchesResponse:
    """
    Run the full job-matching pipeline for the current user:
      1. Load user's skill map from user_skills
      2. Score all active jobs by skill overlap
      3. Send top 10 to GPT-4o mini for re-ranking + explanations + action plans
      4. Persist results to user_job_matches (top 3 marked is_recommended=True)

    Cached per batch_week — skips LLM if already computed this week.
    """
    db = get_supabase_admin()
    user_id = current_user["user_id"]
    batch_week = _last_monday()

    assert_not_rate_limited(db, user_id, "user_job_matches", "computed_at")

    # Cache check
    if llm_ranker.is_cache_valid(db, user_id, batch_week):
        return ComputeJobMatchesResponse(
            matches_written=0,
            from_cache=True,
            batch_week=batch_week,
        )

    # Build user skill map from user_skills table
    skills_result = (
        db.table("user_skills")
        .select("matched_level, skills(taxonomy_key)")
        .eq("user_id", user_id)
        .execute()
    )
    if not skills_result.data:
        return ComputeJobMatchesResponse(
            matches_written=0,
            from_cache=False,
            batch_week=batch_week,
            needs_onboarding=True,
        )

    user_skill_map: dict[str, int] = {
        row["skills"]["taxonomy_key"]: row["matched_level"]
        for row in skills_result.data
        if row.get("skills")
    }

    profile_result = (
        db.table("user_profiles")
        .select("target_roles, target_location")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_result.data or {}

    # Get top 10 by overlap with aspiration rerank
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

    # LLM re-rank + persist
    written = llm_ranker.rank_and_persist(db, user_id, batch_week, user_skill_map, top_jobs)

    return ComputeJobMatchesResponse(
        matches_written=written,
        from_cache=False,
        batch_week=batch_week,
    )


@router.get("/applications", response_model=list[ApplicationResponse])
async def get_applications(current_user: dict = Depends(get_current_user)) -> list[ApplicationResponse]:
    # Admin client so the join to `jobs` table works regardless of its RLS policy.
    result = (
        get_supabase_admin()
        .table("job_applications")
        .select("*, jobs(job_title, company_name, job_description)")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return [_to_application(row) for row in result.data]


@router.put("/applications/{job_id}", response_model=ApplicationResponse)
async def update_application(
    job_id: str,
    body: ApplicationStatusUpdate,
    current_user: dict = Depends(get_current_user),
) -> ApplicationResponse:
    valid_statuses = {"pending", "applied", "no_response", "responded", "interviewing", "rejected", "offer"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {body.status}")

    updates = {"status": body.status}
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.company_response is not None:
        updates["company_response"] = body.company_response
    if body.status == "applied":
        from datetime import datetime, timezone
        updates["applied_at"] = datetime.now(timezone.utc).isoformat()

    user_db = get_supabase_for_token(current_user["token"])
    user_db.table("job_applications").upsert(
        {"user_id": current_user["user_id"], "job_id": job_id, **updates},
        on_conflict="user_id,job_id",
    ).execute()
    # Admin client for the read-back so the jobs join isn't blocked by RLS.
    result = (
        get_supabase_admin()
        .table("job_applications")
        .select("*, jobs(job_title, company_name, job_description)")
        .eq("user_id", current_user["user_id"])
        .eq("job_id", job_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return _to_application(result.data)


@router.get("/{job_id}/skill-gap", response_model=SkillGapResponse)
async def get_skill_gap(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> SkillGapResponse:
    """Per-job skill gap: which required skills the user has vs. is missing."""
    db = get_supabase_admin()
    user_id = current_user["user_id"]

    job_result = db.table("jobs").select(
        "job_id, job_title, company_name, main_skills, side_skills"
    ).eq("job_id", job_id).single().execute()
    if not job_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job = job_result.data
    main_skills = [s.strip() for s in (job.get("main_skills") or []) if s and s.strip()]
    side_skills = [s.strip() for s in (job.get("side_skills") or []) if s and s.strip()]

    skills_result = db.table("user_skills").select(
        "matched_level, skills(taxonomy_key)"
    ).eq("user_id", user_id).execute()

    user_skill_map: dict[str, int] = {}
    for row in (skills_result.data or []):
        if row.get("skills"):
            user_skill_map[row["skills"]["taxonomy_key"].lower()] = row["matched_level"]

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
        notes=row.get("notes"),
        created_at=row["created_at"],
    )
