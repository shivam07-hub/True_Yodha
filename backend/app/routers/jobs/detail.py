from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import SkillGapItem, SkillGapResponse

router = APIRouter()


@router.get("/{job_id}/skill-gap", response_model=SkillGapResponse)
async def get_skill_gap(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> SkillGapResponse:
    job = repo.get_job_skills(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    main_skills = [skill.strip() for skill in (job.get("main_skills") or []) if skill and skill.strip()]
    side_skills = [skill.strip() for skill in (job.get("side_skills") or []) if skill and skill.strip()]
    user_skill_map = repo.get_user_skill_map(current_user["user_id"])

    gap_items: list[SkillGapItem] = []
    for skill in main_skills:
        level = user_skill_map.get(skill.lower())
        gap_items.append(SkillGapItem(skill=skill, is_primary=True, user_level=level, missing=level is None))
    for skill in side_skills:
        level = user_skill_map.get(skill.lower())
        gap_items.append(SkillGapItem(skill=skill, is_primary=False, user_level=level, missing=level is None))

    total = len(gap_items)
    missing_count = sum(1 for item in gap_items if item.missing)
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
