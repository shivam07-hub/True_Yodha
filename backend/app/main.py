import asyncio
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

from app.config import settings
from app.request_timing import RequestTimingMiddleware
from app.routers import (
    ai_workflow_audit,
    auth,
    career_profile,
    career_skill_path,
    comments,
    companies,
    cv,
    diary,
    feedback,
    ghost_index,
    growth,
    home,
    institutions,
    internal,
    job_switch_plan,
    jobs,
    mentor,
    myrology,
    newsletter,
    notifications,
    private_notes,
    onboarding,
    partner,
    partner_connect,
    payments,
    job_tracks,
    preflight,
    profile,
    roles,
    public,
    scores,
    skill_certificate_public,
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
from app.services.background import registry as background_registry  # noqa: F401
from app.services.job_feed.taxonomy import JobFeedTaxonomyMismatchError, verify_taxonomy_integrity

# Server-lifecycle channel. The app namespace has no handler of its own, so
# anything logged there falls to logging.lastResort, which drops everything below
# WARNING — an INFO boot line would vanish. uvicorn.error is the logger uvicorn
# itself uses for "Application startup complete", it is configured at INFO, and
# install_sensitive_log_filter has already attached redaction to its handlers.
logger = logging.getLogger("uvicorn.error")

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

install_cors(app, settings.cors_origins, settings.cors_origin_regex)

# Server-side per-request timing → X-Process-Time header + slow-request log.
# Added after CORS so timing wraps the inner app (CORS preflight stays instant).
app.add_middleware(RequestTimingMiddleware)

app.include_router(ai_workflow_audit.router)
app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(users.router)
app.include_router(feedback.router)
app.include_router(ghost_index.router)
app.include_router(growth.router)
app.include_router(institutions.router)
app.include_router(job_tracks.router)
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
app.include_router(career_skill_path.router)
app.include_router(xp.router)
app.include_router(profile.router)
app.include_router(payments.router)
app.include_router(preflight.router)
app.include_router(mentor.router)
app.include_router(myrology.router)
app.include_router(job_switch_plan.router)
app.include_router(newsletter.router)
app.include_router(notifications.router)
app.include_router(onboarding.router)
app.include_router(partner.router)
app.include_router(partner_connect.router)
app.include_router(roles.router)
app.include_router(public.router)
app.include_router(skill_certificate_public.router)
app.include_router(status.router)
app.include_router(telemetry.router)
app.include_router(upskilling.router)
app.include_router(internal.router)


@app.on_event("startup")
async def _validate_runtime_configuration() -> None:
    settings.validate_runtime_configuration()
    # Print the resolved environment contract on every boot. A CORS allowlist
    # that names no frontend is invisible from the outside — it just answers 400
    # to preflights and the app renders an empty shell (2026-07-27). One line in
    # the deploy log makes "which tier am I, and who may call me" checkable
    # without shelling into the service.
    logger.info(
        "boot tier=%s service=%s origins=%s preview_regex=%s",
        settings.release_tier,
        settings.railway_service_name or "local",
        ",".join(settings.cors_origins) or "none",
        settings.cors_origin_regex or "none",
    )
    from app.notice.wiring import bind_from_settings

    bind_from_settings()


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


@app.on_event("startup")
async def _start_skill_floor_heartbeat() -> None:
    """Watch for jobs that carry no skills — see skill_floor_heartbeat.

    A job with no skills reaches no user, and nothing else notices: every gate
    stays green and the API answers 200. 6,252 jobs sat that way for four
    months. This has to run in the web process, because a metric emitted by the
    enrichment worker cannot report the enrichment worker not running.
    """
    from app.config import settings

    if not settings.supabase_url or not settings.supabase_service_key:
        return
    from app.services.skill_floor_heartbeat import run_forever

    asyncio.create_task(run_forever())


@app.get("/robots.txt", include_in_schema=False, response_class=PlainTextResponse)
async def robots() -> str:
    """Keep the API host out of search results.

    `api.himyro.com` is an API, not a site: every path is either JSON for an
    authed client or a 404, so anything a crawler indexes here is noise
    competing with himyro.com's own pages. Prod logs show crawlers requesting
    this file and getting a 404, which is not an answer — an absent robots.txt
    means "crawl everything".
    """
    return "User-agent: *\nDisallow: /\n"


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
