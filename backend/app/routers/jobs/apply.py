from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    APPLICATION_STATUSES,
    ApplicationResponse,
    ApplicationStatusUpdate,
    JobImportPreviewRequest,
    JobImportPreviewResponse,
    JobImportRequest,
)
from app.services import jobs_workflow

from ._shared import to_application

router = APIRouter()


@router.get("/applications", response_model=list[ApplicationResponse])
async def get_applications(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> list[ApplicationResponse]:
    rows = repo.get_user_applications(current_user["user_id"])
    return [to_application(row) for row in rows]


@router.post("/import/preview", response_model=JobImportPreviewResponse)
async def preview_job_import(
    body: JobImportPreviewRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobImportPreviewResponse:
    if not body.job_description.strip():
        raise HTTPException(status_code=422, detail="Job description is required.")
    return JobImportPreviewResponse(**jobs_workflow.preview_imported_job(repo, body))


@router.post("/import", response_model=ApplicationResponse)
async def import_job(
    body: JobImportRequest,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    if not body.role_name.strip() or not body.job_description.strip():
        raise HTTPException(status_code=422, detail="Role name and job description are required.")
    return ApplicationResponse(
        **jobs_workflow.save_imported_job(repo, current_user["user_id"], body)
    )


@router.put("/applications/{job_id}", response_model=ApplicationResponse)
async def update_application(
    job_id: str,
    body: ApplicationStatusUpdate,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    if body.status not in APPLICATION_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {body.status}")

    now = datetime.now(timezone.utc).isoformat()
    user_id = current_user["user_id"]
    existing = repo.get_application_with_job(user_id, job_id) or {}
    prior_status = existing.get("status")

    updates: dict = {"status": body.status}
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.company_response is not None:
        updates["company_response"] = body.company_response
    if body.status == "applied":
        updates["applied_at"] = now
    if body.status in {"screening", "interviewing", "final_round", "rejected", "offer"}:
        updates["response_at"] = now
    if body.status == "offer":
        updates["offer_received_at"] = now
    if body.status in {"ghosted", "withdrew", "rejected"}:
        updates["closed_at"] = now
    if body.followed_up:
        updates["followed_up_at"] = now

    # Q7: bump the stale-clock signal whenever status actually changes.
    # Notes/followed_up edits do NOT reset the clock so they can't mask company silence.
    if body.status != prior_status:
        updates["last_stage_changed_at"] = now

    # Q6: first-ever offer per user — set first_offer_at once on the user profile.
    is_first_offer = False
    if body.status == "offer" and prior_status != "offer":
        is_first_offer = repo.mark_first_offer_if_unset(user_id, now)

    repo.upsert_application(user_id, job_id, updates)
    data = repo.get_application_with_job(user_id, job_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    response = to_application(data)
    response.is_first_offer = is_first_offer
    return response


@router.post("/save/{job_id}", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def save_discovered_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    user_id = current_user["user_id"]
    repo.upsert_application(user_id, job_id, {"status": "saved", "source": "user_discovery"})
    data = repo.get_application_with_job(user_id, job_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return to_application(data)


@router.delete("/tracker/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tracker_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    repo.delete_tracker_rows(current_user["user_id"], job_id)
