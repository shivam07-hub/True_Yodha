"""Durable final transition for the first-run onboarding journey."""
from __future__ import annotations

from urllib.parse import quote

from fastapi import HTTPException, status
from supabase import Client

from app.repositories.jobs import JobsRepository
from app.repositories.onboarding import OnboardingRepository


# A first role is one the person chose, however it arrived. A pasted job and a job
# saved with the extension are the same receipt. Nothing writes
# `onboarding_shortlist` any more; its rows are still receipts.
FIRST_ROLE_SOURCES = frozenset({"onboarding_shortlist", "onboarding_import", "extension"})


def saved_first_role(
    jobs_repo: JobsRepository,
    user_id: str,
    *,
    preferred_job_id: str | None = None,
) -> dict[str, str] | None:
    rows = [
        item
        for item in jobs_repo.get_user_applications(user_id)
        if item.get("source") in FIRST_ROLE_SOURCES
    ]
    row = next(
        (item for item in rows if preferred_job_id and str(item.get("job_id") or "") == preferred_job_id),
        None,
    )
    if row is None and rows:
        row = rows[0]
    if row is None:
        return None
    job = row.get("jobs") or {}
    job_id = str(row["job_id"])
    return {
        "job_id": job_id,
        "title": str(job.get("job_title") or "Saved role"),
        "company": str(job.get("company_name") or ""),
        "tailor_href": f"/cv?jobId={quote(job_id, safe='')}",
    }


def accept_first_job(
    db: Client,
    jobs_repo: JobsRepository,
    user_id: str,
    job_id: str,
) -> dict[str, str]:
    """The job the person just added is their first role.

    Idempotent. A retry after the receipt was written returns the same tailor
    link and does not open a second application.
    """
    existing = saved_first_role(jobs_repo, user_id, preferred_job_id=job_id)
    if existing and existing["job_id"] == job_id:
        _finish(db, user_id)
        return {"kind": "first_role_saved", **existing}

    owned = jobs_repo.get_application_with_job(user_id, job_id)
    if owned is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That job is not in your list.")
    source = str(owned.get("source") or "")
    if source not in FIRST_ROLE_SOURCES:
        if not job_id.startswith("ext_"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Choose a job you added.",
            )
        jobs_repo.upsert_application(
            user_id,
            job_id,
            {"status": "saved", "source": "onboarding_import"},
        )
        if jobs_repo.get_application_with_job(user_id, job_id) is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The role was not saved. Try again.",
            )

    _finish(db, user_id)
    saved = saved_first_role(jobs_repo, user_id, preferred_job_id=job_id)
    if saved is None or saved["job_id"] != job_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The role was not saved. Try again.",
        )
    return {"kind": "first_role_saved", **saved}


def _finish(db: Client, user_id: str) -> None:
    repo = OnboardingRepository(db)
    repo.mark_job_saved(user_id)
    repo.mark_completed(user_id)
