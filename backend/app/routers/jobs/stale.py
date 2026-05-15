from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import StaleApplicationItem

router = APIRouter()


@router.get("/applications/stale", response_model=list[StaleApplicationItem])
async def get_stale_applications(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> list[StaleApplicationItem]:
    rows = repo.get_stale_applications(current_user["user_id"])
    return [
        StaleApplicationItem(
            id=r["id"],
            job_id=r["job_id"],
            title=(r.get("jobs") or {}).get("job_title") or "",
            company=(r.get("jobs") or {}).get("company_name"),
            status=r["status"],
            updated_at=r.get("updated_at"),
        )
        for r in rows
    ]
