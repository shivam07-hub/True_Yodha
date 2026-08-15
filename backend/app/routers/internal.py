"""Internal service-to-service hooks after a scraper publication.

Not a user surface — guarded by a shared secret header, called by our own
infrastructure. The scrape-landed webhook hands every published run to the
deterministic Stage A skill-floor worker. It does not eagerly match users;
matching is pulled on their next visit (see `services/new_inventory.py`) so
LLM compute follows intent.
"""
from __future__ import annotations

import hmac
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
from app.repositories.partners import PartnersRepository
from app.schemas.partner import BroadcastRequest, BroadcastResponse
from app.services import partner_broadcast, partner_webhooks, skill_floor_pipeline
from app.services.matching import scrape_sweep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])


def require_scrape_webhook(x_scrape_token: str | None = Header(default=None)) -> None:
    expected = settings.scrape_webhook_token.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scrape webhook is not configured.",
        )
    supplied = (x_scrape_token or "").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid scrape webhook token.",
        )


class ScrapeLandedRequest(BaseModel):
    run_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
    )
    # How far back counts as "this landing" (default 24h). Timestamps, not the
    # scraper's YYYYMMDD marker: that marker is the run-date FOLDER, so a batch
    # imported the morning after its run arrives already dated yesterday.
    since_hours: int = 24
    # Opt-in eager fan-out (admin only). OFF by design — see the docstring.
    sweep: bool = False
    # Partner fan-out. ON by design, and NOT the same trade-off as `sweep`: a
    # partner's users are not on the site to pull anything, and the broadcast is
    # deterministic SQL, not LLM ranking, so it costs no provider budget.
    notify_partners: bool = True


class ScrapeLandedResponse(BaseModel):
    new_jobs: int
    affected_users: int
    enqueued: int
    skill_floor_enqueued: bool
    since: str


@router.post(
    "/scrape/landed",
    response_model=ScrapeLandedResponse,
    dependencies=[Depends(require_scrape_webhook)],
)
def scrape_landed(body: ScrapeLandedRequest) -> ScrapeLandedResponse:
    """The scraper finished a batch → floor its jobs and acknowledge it.

    Deliberately does NOT match anyone (Shivam, 2026-07-28). The rows themselves,
    stamped `ingested_at` by the DB, ARE the record; each user's next visit turns
    that into a visible prompt and the user pulls their own match. Matching every
    affected user on landing spends the shared LLM budget on people who may never
    return, and it is the users who DO come back that we want to serve.

    `sweep=true` still exists for a deliberate admin fan-out (`run_sweep` +
    `scrape_sweep_cli`), never for the routine path.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=max(1, body.since_hours))
    admin_db = get_supabase_admin()
    repo = JobsRepository(admin_db, admin_db)
    floor_enqueued = skill_floor_pipeline.enqueue_drain(body.run_id)

    if body.notify_partners:
        partner_broadcast.enqueue_broadcast()

    if body.sweep:
        result = scrape_sweep.run_sweep(repo, since=since)
        logger.info("metric scrape_webhook.landed sweep=1 since=%s result=%s", since, result)
        return ScrapeLandedResponse(
            since=since.isoformat(),
            skill_floor_enqueued=floor_enqueued,
            **result,
        )

    new_jobs = repo.count_new_jobs_since(since)
    logger.info("metric scrape_webhook.landed sweep=0 since=%s new_jobs=%d", since, new_jobs)
    return ScrapeLandedResponse(
        new_jobs=new_jobs,
        affected_users=0,
        enqueued=0,
        skill_floor_enqueued=floor_enqueued,
        since=since.isoformat(),
    )


# ── partner integrations ───────────────────────────────────────────────────


@router.post(
    "/partners/broadcast",
    response_model=BroadcastResponse,
    dependencies=[Depends(require_scrape_webhook)],
)
def partners_broadcast(body: BroadcastRequest) -> BroadcastResponse:
    """Fan the current inventory out to partner seats.

    `dry_run` runs the identical resolution and reports what WOULD be sent
    without emitting or writing the ledger — run it before the first real
    broadcast to a new partner, because the ledger cannot be un-written.
    """
    kwargs = {
        "jobs_per_user": body.jobs_per_user,
        "max_experience_years": body.max_experience_years,
        "dry_run": body.dry_run,
    }
    if body.partner_slug:
        admin_db = get_supabase_admin()
        partner = PartnersRepository(admin_db).get_partner_by_slug(body.partner_slug)
        if not partner:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Unknown partner slug."
            )
        result = partner_broadcast.broadcast_new_jobs(
            partner_id=str(partner["id"]), slug=body.partner_slug, **kwargs
        )
        return BroadcastResponse(results={body.partner_slug: result})
    return BroadcastResponse(results=partner_broadcast.broadcast_all(**kwargs))


@router.post(
    "/partners/webhook-sweep",
    response_model=dict,
    dependencies=[Depends(require_scrape_webhook)],
)
def partners_webhook_sweep(limit: int = 100) -> dict:
    """Re-enqueue partner webhook deliveries whose next attempt is due.

    This IS the retry engine — nothing else re-attempts a failed delivery. Run it
    on a schedule; without it a partner outage means one attempt and silence.
    """
    return partner_webhooks.sweep_due(limit=max(1, min(limit, 500)))
