from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
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
    valid_statuses = {
        "pending",
        "applied",
        "no_response",
        "responded",
        "interviewing",
        "rejected",
        "offer",
        "abandoned",
    }
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
    return to_application(data)


@router.post("/save/{job_id}", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def save_discovered_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    user_id = current_user["user_id"]
    repo.upsert_application(user_id, job_id, {"status": "pending", "source": "user_discovery"})
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
