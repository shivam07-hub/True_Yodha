from pathlib import Path

from fastapi import FastAPI

from app.config import settings
from app.request_timing import RequestTimingMiddleware
from app.routers import (
    auth,
    career_profile,
    comments,
    companies,
    cv,
    diary,
    feedback,
    growth,
    home,
    institutions,
    internal,
    job_switch_plan,
    jobs,
    myrology,
    newsletter,
    notifications,
    private_notes,
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
    user_memory,
    users,
    xp,
)
from app.security import (
    install_auth_rate_limits,
    install_cors,
    install_error_handling,
    install_security_headers,
    install_sensitive_log_filter,
)
from app.services.job_feed.taxonomy import JobFeedTaxonomyMismatchError, verify_taxonomy_integrity

_TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "lightcast_skills_taxonomy.json"

install_sensitive_log_filter()

app = FastAPI(
    title="Mirror API",
    description="Mirror — The Job Seeker's Reality Check",
    version="0.1.0",
    debug=settings.debug,
)
install_auth_rate_limits(app)
install_error_handling(app)
install_security_headers(app)

install_cors(app, settings.cors_origins)

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
app.include_router(private_notes.router)
app.include_router(user_memory.router)
app.include_router(career_profile.router)
app.include_router(xp.router)
app.include_router(profile.router)
app.include_router(payments.router)
app.include_router(myrology.router)
app.include_router(job_switch_plan.router)
app.include_router(newsletter.router)
app.include_router(notifications.router)
app.include_router(newsletter_distribution.router)
app.include_router(onboarding.router)
app.include_router(public.router)
app.include_router(status.router)
app.include_router(telemetry.router)
app.include_router(upskilling.router)
app.include_router(internal.router)


@app.on_event("startup")
async def _validate_runtime_configuration() -> None:
    settings.validate_runtime_configuration()


@app.on_event("startup")
async def _raise_sync_threadpool_limit() -> None:
    """Backlog #16 (prod read-capacity). Sync routes block a thread for the
    duration of each Supabase call; the AnyIO default of 40 threads queues a
    concurrent burst behind each other, surfacing as `metric route.slow`
    clusters landing together at the 8s PostgREST timeout. Raising the token
    count only widens app-side concurrency — it does not raise Postgres
    connection count (the app talks to PostgREST over HTTP; PostgREST bounds
    its own DB pool regardless of app-side concurrency). See
    app.config.Settings.sync_threadpool_tokens for the full rationale.
    """
    import anyio.to_thread

    anyio.to_thread.current_default_thread_limiter().total_tokens = (
        settings.sync_threadpool_tokens
    )


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
    # Dead-man for the listing-verification belt. It rides the health probe
    # because a stalled sweep cannot report its own absence — and the belt ran
    # dead for four days in July before anyone noticed. Throttled internally, so
    # probe frequency doesn't drive DB load, and it never changes `status`: a
    # stalled verifier degrades listing freshness, it does not make the API
    # unhealthy.
    from app.services import verifier_health

    belt = verifier_health.check_belt()
    return {
        "status": "ok",
        "verifier": belt.state,
        "verifier_stale_hours": belt.stale_hours,
        "verifier_productive_stale_hours": belt.productive_stale_hours,
        "verifier_priority_backlog": belt.priority_backlog,
    }
