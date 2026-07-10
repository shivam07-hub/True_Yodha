"""Internal service-to-service hooks (Backlog #36 event-driven matching).

Not a user surface — guarded by a shared secret header, called by our own
infrastructure. Today: the scrape-landed webhook the scraper fires after it
writes a batch of new jobs, so the app sweeps + notifies affected users
immediately (compute-then-notify) instead of polling on a timer.
"""
from __future__ import annotations

import hmac
import logging
from datetime import date, timedelta

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
    # Optional YYYYMMDD floor — sweep jobs whose first_seen is strictly after it.
    # Omit and the app defaults to "today's jobs" (yesterday's marker). first_seen
    # is date-granular, so a same-day 2nd batch is covered by the default window;
    # the per-user cache gate dedups users already caught up today.
    since_marker: int | None = None


class ScrapeLandedResponse(BaseModel):
    new_jobs: int
    affected_users: int
    enqueued: int
    since_marker: int


def _default_marker() -> int:
    """Yesterday as YYYYMMDD → get_new_job_ids_since returns first_seen > it =
    everything inserted today (the batch that just landed)."""
    return int((date.today() - timedelta(days=1)).strftime("%Y%m%d"))


@router.post(
    "/scrape/landed",
    response_model=ScrapeLandedResponse,
    dependencies=[Depends(require_scrape_webhook)],
)
def scrape_landed(body: ScrapeLandedRequest) -> ScrapeLandedResponse:
    """The scraper finished writing a batch → sweep affected users NOW.

    Runs inline: run_sweep is cheap (deterministic pre-filter SQL + enqueue) — the
    per-user brain recompute + notify + Agent Picks regen run async on the RQ bulk
    lane. Returns the sweep counts so the scraper can log/verify the fan-out.
    """
    marker = body.since_marker if body.since_marker is not None else _default_marker()
    admin_db = get_supabase_admin()
    repo = JobsRepository(admin_db, admin_db)
    result = scrape_sweep.run_sweep(repo, since_marker=marker)
    logger.info("metric scrape_webhook.landed marker=%d result=%s", marker, result)
    return ScrapeLandedResponse(since_marker=marker, **result)
