from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.request_timing import RequestTimingMiddleware
from app.routers import (
    auth,
    comments,
    companies,
    cv,
    diary,
    feedback,
    growth,
    home,
    institutions,
    job_switch_plan,
    jobs,
    myrology,
    newsletter,
    newsletter_distribution,
    onboarding,
    payments,
    profile,
    public,
    scores,
    skills,
    status,
    telemetry,
    upskilling,
    users,
    xp,
)
from app.services.job_feed.taxonomy import JobFeedTaxonomyMismatchError, verify_taxonomy_integrity

_TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "lightcast_skills_taxonomy.json"

app = FastAPI(
    title="Mirror API",
    description="Mirror — The Job Seeker's Reality Check",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Server-side per-request timing → X-Process-Time header + slow-request log.
# Added after CORS so timing wraps the inner app (CORS preflight stays instant).
app.add_middleware(RequestTimingMiddleware)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(users.router)
app.include_router(feedback.router)
app.include_router(growth.router)
app.include_router(institutions.router)
app.include_router(skills.router)
app.include_router(cv.router)
app.include_router(scores.router)
app.include_router(jobs.router)
app.include_router(home.router)
app.include_router(diary.router)
app.include_router(comments.router)
app.include_router(xp.router)
app.include_router(profile.router)
app.include_router(payments.router)
app.include_router(myrology.router)
app.include_router(job_switch_plan.router)
app.include_router(newsletter.router)
app.include_router(newsletter_distribution.router)
app.include_router(onboarding.router)
app.include_router(public.router)
app.include_router(status.router)
app.include_router(telemetry.router)
app.include_router(upskilling.router)


@app.on_event("startup")
async def _verify_taxonomy_integrity() -> None:
    try:
        verify_taxonomy_integrity(_TAXONOMY_PATH)
    except JobFeedTaxonomyMismatchError as exc:
        raise RuntimeError(f"Taxonomy integrity check failed on boot: {exc}") from exc


@app.on_event("startup")
async def _sweep_orphaned_cv_upload_jobs() -> None:
    """Recover any cv_upload_jobs left in `processing` by a prior crash/restart.
    Refunds XP via the idempotent refund_xp RPC and marks the rows failed.
    Bounded sweep — safe to run on every boot.
    """
    try:
        from app.config import settings
        if not settings.supabase_url or not settings.supabase_service_key:
            return
        from app.repositories import cv_upload_jobs as upload_jobs_repo
        swept = upload_jobs_repo.sweep_stale_processing_jobs(minutes=5)
        if swept:
            import logging
            logging.getLogger(__name__).warning(
                "Startup sweep: recovered %d orphaned cv_upload_jobs", len(swept),
            )
    except Exception:  # pragma: no cover — sweep failure must not block boot
        import logging
        logging.getLogger(__name__).exception("Startup orphan-sweep failed")


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}
