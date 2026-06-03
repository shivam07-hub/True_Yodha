from fastapi import APIRouter, Depends, HTTPException, status as http_status

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import StaleApplicationItem

router = APIRouter()


@router.get("/applications/stale", response_model=list[StaleApplicationItem])
def get_stale_applications(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> list[StaleApplicationItem]:
    rows = repo.get_stale_applications(principal.id)
    return [
        StaleApplicationItem(
            id=r["id"],
            job_id=r["job_id"],
            title=(r.get("jobs") or {}).get("job_title") or "",
            company=(r.get("jobs") or {}).get("company_name"),
            status=r["status"],
            updated_at=r.get("updated_at"),
            last_stage_changed_at=r.get("last_stage_changed_at"),
        )
        for r in rows
    ]


@router.post("/applications/{job_id}/dismiss-stale", status_code=http_status.HTTP_204_NO_CONTENT)
def dismiss_stale(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    """Q7: snooze the 7-day stale prompt by bumping last_stage_changed_at = now()."""
    updated = repo.dismiss_stale_application(principal.id, job_id)
    if not updated:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Application not found.")
