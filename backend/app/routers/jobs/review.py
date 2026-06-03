from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    APPLICATION_OUTCOMES,
    APPLICATION_STAGES,
    ApplicationReviewRequest,
    ApplicationReviewResponse,
)

router = APIRouter()


@router.post(
    "/applications/{job_id}/review",
    response_model=ApplicationReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_application_review(
    job_id: str,
    body: ApplicationReviewRequest,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationReviewResponse:
    if not (1 <= body.star_rating <= 5):
        raise HTTPException(status_code=422, detail="star_rating must be 1–5")
    if body.last_stage not in APPLICATION_STAGES:
        raise HTTPException(status_code=422, detail=f"Invalid last_stage: {body.last_stage}")

    user_id = principal.id
    app_row = repo.get_application_with_job(user_id, job_id)
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")

    app_status = app_row.get("status", "")
    if app_status not in APPLICATION_OUTCOMES:
        raise HTTPException(
            status_code=409,
            detail=f"Review requires a terminal outcome status. Current status: {app_status}",
        )

    job = app_row.get("jobs") or {}
    company_name = job.get("company_name") or "Unknown"
    app_id: int = app_row["id"]

    row = repo.insert_application_review(
        job_application_id=app_id,
        user_id=user_id,
        company_name=company_name,
        star_rating=body.star_rating,
        last_stage=body.last_stage,
        outcome=app_status,
        written_note=body.written_note,
    )
    return ApplicationReviewResponse(**row)
