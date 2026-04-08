from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase_admin
from app.deps import get_current_user
from app.schemas import (
    ActionPlanDay,
    ApplicationResponse,
    ApplicationStatusUpdate,
    ComputeJobMatchesResponse,
    JobMatchResponse,
    JobMatchesResponse,
)
from app.services import job_matcher, llm_ranker

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _last_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


@router.get("/matches", response_model=JobMatchesResponse)
async def get_job_matches(current_user: dict = Depends(get_current_user)) -> JobMatchesResponse:
    batch_week = _last_monday()
    db = get_supabase_admin()

    result = (
        db.table("user_job_matches")
        .select(
            "id, job_id, overlap_score, llm_rank, llm_explanation, is_recommended, action_plan, batch_week, computed_at,"
            "job_postings(title, company, location, remote, source_url)"
        )
        .eq("user_id", current_user["user_id"])
        .eq("batch_week", str(batch_week))
        .eq("is_recommended", True)
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
      2. Score all active job_postings by skill overlap
      3. Send top 10 to GPT-4o mini for re-ranking + explanations + action plans
      4. Persist results to user_job_matches (top 3 marked is_recommended=True)

    Cached per batch_week — skips LLM if already computed this week.
    """
    db = get_supabase_admin()
    user_id = current_user["user_id"]
    batch_week = _last_monday()

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No skills found. Upload your CV first.",
        )

    user_skill_map: dict[str, int] = {
        row["skills"]["taxonomy_key"]: row["matched_level"]
        for row in skills_result.data
        if row.get("skills")
    }

    # Get top 10 by overlap
    top_jobs = job_matcher.get_top_matches(db, user_skill_map, top_n=10)
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
    result = (
        get_supabase_admin()
        .table("job_applications")
        .select("*, job_postings(title, company)")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return [_to_application(row) for row in result.data]


@router.put("/applications/{job_id}", response_model=ApplicationResponse)
async def update_application(
    job_id: int,
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

    result = (
        get_supabase_admin()
        .table("job_applications")
        .upsert({"user_id": current_user["user_id"], "job_id": job_id, **updates}, on_conflict="user_id,job_id")
        .select("*, job_postings(title, company)")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return _to_application(result.data[0])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_job_match(row: dict, batch_week: date) -> JobMatchResponse:
    posting = row.get("job_postings") or {}
    action_plan = [ActionPlanDay(**d) for d in (row.get("action_plan") or [])]
    return JobMatchResponse(
        id=row["id"],
        job_id=row["job_id"],
        title=posting.get("title", ""),
        company=posting.get("company"),
        location=posting.get("location"),
        remote=posting.get("remote", False),
        overlap_score=row.get("overlap_score", 0),
        llm_rank=row.get("llm_rank"),
        llm_explanation=row.get("llm_explanation"),
        action_plan=action_plan,
        batch_week=batch_week,
        source_url=posting.get("source_url"),
    )


def _to_application(row: dict) -> ApplicationResponse:
    posting = row.get("job_postings") or {}
    return ApplicationResponse(
        id=row["id"],
        job_id=row["job_id"],
        title=posting.get("title", ""),
        company=posting.get("company"),
        status=row["status"],
        applied_at=row.get("applied_at"),
        response_at=row.get("response_at"),
        checkin_sent_at=row.get("checkin_sent_at"),
        notes=row.get("notes"),
        created_at=row["created_at"],
    )
