from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
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

from ._shared import cv_badge_from_row, to_application

router = APIRouter()


@router.get("/applications", response_model=list[ApplicationResponse])
async def get_applications(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> list[ApplicationResponse]:
    """Tracker list. Each row carries `cv_badge` for its Company CV Thread head.

    Threads are derived (CONTEXT.md → Company CV Thread). One batched read across
    all distinct companies on this page avoids the N+1 per-card fetch.
    """
    rows = repo.get_user_applications(principal.id)
    companies = [(row.get("jobs") or {}).get("company_name") for row in rows]
    latest_by_company = cv_repo.latest_for_thread_batch(
        principal.id,
        [c for c in companies if c],
    )
    out: list[ApplicationResponse] = []
    for row in rows:
        company = (row.get("jobs") or {}).get("company_name")
        out.append(to_application(row, cv_badge_from_row(latest_by_company.get(company))))
    return out


@router.post("/import/preview", response_model=JobImportPreviewResponse)
async def preview_job_import(
    body: JobImportPreviewRequest,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobImportPreviewResponse:
    if not body.job_description.strip():
        raise HTTPException(status_code=422, detail="Job description is required.")
    return JobImportPreviewResponse(**jobs_workflow.preview_imported_job(repo, body))


@router.post("/import", response_model=ApplicationResponse)
async def import_job(
    body: JobImportRequest,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    if not body.role_name.strip() or not body.job_description.strip():
        raise HTTPException(status_code=422, detail="Role name and job description are required.")
    return ApplicationResponse(
        **jobs_workflow.save_imported_job(repo, principal.id, body)
    )


@router.put("/applications/{job_id}", response_model=ApplicationResponse)
async def update_application(
    job_id: str,
    body: ApplicationStatusUpdate,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    if body.status not in APPLICATION_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {body.status}")

    now = datetime.now(timezone.utc).isoformat()
    user_id = principal.id
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
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    user_id = principal.id
    repo.upsert_application(user_id, job_id, {"status": "saved", "source": "user_discovery"})
    data = repo.get_application_with_job(user_id, job_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return to_application(data)


@router.delete("/tracker/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tracker_job(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    repo.delete_tracker_rows(principal.id, job_id)
