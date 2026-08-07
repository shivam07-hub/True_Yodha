from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import SkillGapItem, SkillGapResponse

router = APIRouter()


class JobDescriptionResponse(BaseModel):
    job_id: str
    job_description: str


@router.get("/{job_id}/description", response_model=JobDescriptionResponse)
def get_job_description(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobDescriptionResponse:
    """The full job description, on demand.

    List payloads (`/jobs/matches`, and any surface using `to_job_match`) carry
    only `MATCH_JD_SNIPPET_CHARS` of this text, because the full version
    averages 3,734 chars and accounted for 59.8% of the /jobs/matches payload
    while every consumer but the desktop JD panel truncates it anyway. That one
    panel calls this when `job_description_truncated` is set.

    Reads one column of one row by primary key — the cheapest possible shape,
    and only when a user has actually opened the panel.
    """
    description = repo.get_job_description(job_id)
    if description is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobDescriptionResponse(job_id=job_id, job_description=description)


@router.get("/{job_id}/skill-gap", response_model=SkillGapResponse)
def get_skill_gap(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> SkillGapResponse:
    job = repo.get_job_skills(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    user_skill_map = repo.get_user_skill_map(principal.id)

    gap_items: list[SkillGapItem] = []
    for skill in job.get("skills") or []:
        key = skill["taxonomy_key"]
        is_primary = skill["is_primary"]
        user_level = user_skill_map.get(key.lower()) or 0
        required_level = skill["required_level"]
        gap_items.append(SkillGapItem(
            skill=key, is_primary=is_primary,
            user_level=user_level, required_level=required_level,
            missing=user_level < required_level,
        ))

    # Sort: missing primary → below-level primary → missing secondary → below-level secondary
    gap_items.sort(key=lambda g: (
        0 if (g.is_primary and g.user_level == 0) else
        1 if (g.is_primary and g.missing) else
        2 if (not g.is_primary and g.user_level == 0) else
        3 if (not g.is_primary and g.missing) else 4
    ))

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
