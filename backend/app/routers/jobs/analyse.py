from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import xp_service

router = APIRouter()

ANALYSE_XP_COST = 50


@router.post("/analyse/{job_id}", status_code=status.HTTP_201_CREATED)
async def analyse_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> dict:
    user_id = current_user["user_id"]

    job = repo.get_job_skills(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    new_balance = await xp_service.spend_xp(user_id, ANALYSE_XP_COST, "analyse_job")

    user_skill_map = repo.get_user_skill_map(user_id)
    skills = job.get("skills") or []
    total = len(skills)
    matched_keys = [
        s["taxonomy_key"]
        for s in skills
        if user_skill_map.get(s["taxonomy_key"].lower(), 0) > 0
    ]
    overlap_score = round(len(matched_keys) / total * 100) if total else 0

    repo.upsert_job_match(user_id, job_id, {
        "batch_week": str(date.today()),
        "overlap_score": overlap_score,
        "matched_skills": matched_keys,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "llm_rank": None,
        "llm_explanation": None,
        "is_recommended": False,
        "action_plan": [],
    })

    return {
        "job_id": job_id,
        "overlap_score": overlap_score,
        "matched_count": len(matched_keys),
        "total_skills": total,
        "new_xp_balance": new_balance,
    }
