"""Durable final transition for the first-run onboarding journey."""
from __future__ import annotations

from urllib.parse import quote

from fastapi import HTTPException, status
from supabase import Client

from app.repositories.jobs import JobsRepository
from app.repositories.onboarding import OnboardingRepository
from app.services import onboarding_service


def saved_first_role(
    jobs_repo: JobsRepository,
    user_id: str,
) -> dict[str, str] | None:
    row = next(
        (
            item
            for item in jobs_repo.get_user_applications(user_id)
            if item.get("source") == "onboarding_shortlist"
        ),
        None,
    )
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


def commit_first_role(
    db: Client,
    jobs_repo: JobsRepository,
    user_id: str,
    job_id: str,
) -> dict[str, str]:
    """Persist a selected current match, then return its tailoring receipt.

    Every write is idempotent. A retry after a partial network failure therefore
    converges without duplicate applications or a false client-side success.
    """
    saved = saved_first_role(jobs_repo, user_id)
    result = onboarding_service.get_result(db, user_id)
    if result.get("kind") == "first_role_saved" and saved and saved["job_id"] == job_id:
        return {"status": "saved", "job_id": job_id, "tailor_href": saved["tailor_href"]}
    if result.get("kind") != "full_result_ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your shortlist is not ready yet.",
        )

    baseline_id = int(result["baseline_version_id"])
    context_hash = str(result["target_context_hash"])
    # The SAME read the result payload's shortlist is built from. It used to be
    # `get_user_match_stack()[:3]` — the context-blind durable stack — filtered
    # here by (baseline, context) but not there, so after a direction change the
    # screen showed the previous direction's cards and this rejected them. Read
    # and write must resolve "your current shortlist" identically or the phrase
    # means two things.
    presented_matches = jobs_repo.get_matches_for_context(
        user_id, baseline_id, context_hash, limit=3
    )
    current_match = next(
        (row for row in presented_matches if str(row.get("job_id") or "") == job_id),
        None,
    )
    if current_match is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Choose a role from your current shortlist.",
        )

    jobs_repo.upsert_application(
        user_id,
        job_id,
        {"status": "saved", "source": "onboarding_shortlist"},
    )
    if jobs_repo.get_application_with_job(user_id, job_id) is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The role was not saved. Try again.",
        )

    OnboardingRepository(db).mark_milestone(user_id, "credible_job_saved")
    onboarding_service.mark_completed(db, user_id)
    return {
        "status": "saved",
        "job_id": job_id,
        "tailor_href": f"/cv?jobId={quote(job_id, safe='')}",
    }
