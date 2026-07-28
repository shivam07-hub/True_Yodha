"""Internal service-to-service hooks (Backlog #36 event-driven matching).

Not a user surface — guarded by a shared secret header, called by our own
infrastructure. Today: the scrape-landed webhook the scraper fires after it
writes a batch of new jobs. It acknowledges the landing; it does not match
anyone. Matching is pulled by the user on their next visit (see
`services/new_inventory.py`) so compute follows intent.
"""
from __future__ import annotations

import hmac
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
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
    # How far back counts as "this landing" (default 24h). Timestamps, not the
    # scraper's YYYYMMDD marker: that marker is the run-date FOLDER, so a batch
    # imported the morning after its run arrives already dated yesterday.
    since_hours: int = 24
    # Opt-in eager fan-out (admin only). OFF by design — see the docstring.
    sweep: bool = False


class ScrapeLandedResponse(BaseModel):
    new_jobs: int
    affected_users: int
    enqueued: int
    since: str


@router.post(
    "/scrape/landed",
    response_model=ScrapeLandedResponse,
    dependencies=[Depends(require_scrape_webhook)],
)
def scrape_landed(body: ScrapeLandedRequest) -> ScrapeLandedResponse:
    """The scraper finished writing a batch → acknowledge the landing.

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

    if body.sweep:
        result = scrape_sweep.run_sweep(repo, since=since)
        logger.info("metric scrape_webhook.landed sweep=1 since=%s result=%s", since, result)
        return ScrapeLandedResponse(since=since.isoformat(), **result)

    new_jobs = repo.count_new_jobs_since(since)
    logger.info("metric scrape_webhook.landed sweep=0 since=%s new_jobs=%d", since, new_jobs)
    return ScrapeLandedResponse(
        new_jobs=new_jobs, affected_users=0, enqueued=0, since=since.isoformat()
    )
