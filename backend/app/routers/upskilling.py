"""Upskilling router (PRD §7).

Surface A — ladder list, serve set, grade+award.
Surface B — job-anchored gap calibration (start + submit).

All routes are token-scoped via get_principal. Served-set responses never carry
the answer key — grading is server-only in /sets/{id}/submit and /gap/.../submit.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas.upskilling import (
    ActivityDatesResponse,
    StartGapResponse,
    StartSetRequest,
    StartSetResponse,
    SubmitGapRequest,
    SubmitGapResponse,
    SubmitSetRequest,
    SubmitSetResponse,
    UpskillingSkill,
)
from app.services import upskilling_service

router = APIRouter(prefix="/upskilling", tags=["upskilling"])


@router.get("/skills", response_model=list[UpskillingSkill])
def list_skills(
    principal: Principal = Depends(get_principal),
) -> list[UpskillingSkill]:
    rows = upskilling_service.list_skills(principal.id)
    return [UpskillingSkill(**r) for r in rows]


@router.get("/activity", response_model=ActivityDatesResponse)
def activity_dates(
    principal: Principal = Depends(get_principal),
) -> ActivityDatesResponse:
    """Recent upskilling-set submission dates — powers the home practice streak."""
    return ActivityDatesResponse(dates=upskilling_service.list_activity_dates(principal.id))


@router.post("/sets", response_model=StartSetResponse)
def start_set(
    body: StartSetRequest,
    principal: Principal = Depends(get_principal),
) -> StartSetResponse:
    result = upskilling_service.start_set(principal.id, body.skill_id, body.level)
    return StartSetResponse(**result)


@router.post("/sets/{set_id}/submit", response_model=SubmitSetResponse)
async def submit_set(
    set_id: str,
    body: SubmitSetRequest,
    principal: Principal = Depends(get_principal),
) -> SubmitSetResponse:
    result = await upskilling_service.submit_set(
        user_id=principal.id,
        set_id=set_id,
        answers=[a.model_dump() for a in body.answers],
        idempotency_key=body.idempotency_key,
    )
    return SubmitSetResponse(**result)


# ── Surface B — job-anchored gap calibration ─────────────────────────────────


def _required_skills(repo: JobsRepository, job_id: str, user_id: str) -> tuple[dict, list[dict]]:
    """Reuse the existing skill-gap inputs: job's required skills + the user's
    levels. Returns (job, required[]) where required carries target + user level."""
    job = repo.get_job_skills(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    user_map = repo.get_user_skill_map(user_id)
    required = [
        {
            "skill_key": s["taxonomy_key"],
            "target_level": s["required_level"],
            "user_level": user_map.get(s["taxonomy_key"].lower()) or 0,
            "is_primary": s["is_primary"],
        }
        for s in (job.get("skills") or [])
    ]
    return job, required


@router.post("/gap/{job_id}/start", response_model=StartGapResponse)
def start_gap(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> StartGapResponse:
    job, required = _required_skills(repo, job_id, principal.id)
    result = upskilling_service.start_gap(
        user_id=principal.id,
        job_id=job_id,
        job_title=job.get("job_title") or "",
        company=job.get("company_name"),
        required=required,
    )
    return StartGapResponse(**result)


@router.post("/gap/{job_id}/submit", response_model=SubmitGapResponse)
def submit_gap(
    job_id: str,
    body: SubmitGapRequest,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> SubmitGapResponse:
    job, _ = _required_skills(repo, job_id, principal.id)
    targets = {s["taxonomy_key"]: s["required_level"] for s in (job.get("skills") or [])}
    result = upskilling_service.submit_gap(
        user_id=principal.id,
        assessment_id=body.assessment_id,
        answers=[a.model_dump() for a in body.answers],
        targets_by_key=targets,
    )
    return SubmitGapResponse(**result)
