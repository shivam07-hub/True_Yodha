"""Durable Stage A execution after a scraper batch lands.

The scraper owns source publication; True_Yodha owns ``job_skills``.  The
existing scrape-landed webhook is the hand-off between those owners, and this
handler keeps the actual extraction off the web request.  Stage A is entirely
deterministic: it reads the local taxonomy and makes no model/provider call.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.database import get_supabase_admin_batch
from app.services import background, skill_floor

logger = logging.getLogger(__name__)

JOB_TYPE = "skill_floor_drain"
JOB_TIMEOUT_SECONDS = 2 * 60 * 60


def enqueue_drain(run_id: str | None) -> bool:
    """Queue one idempotent Stage A drain for a published scraper run."""
    correlation_id = f"scrape:{run_id}" if run_id else None
    background.enqueue(
        background.LANE_BULK,
        JOB_TYPE,
        payload={"run_id": run_id},
        correlation_id=correlation_id,
        # Stage A spends zero model seconds, but each 100-job batch still needs
        # a claim, a resolve, an upsert and a settle. A multi-thousand-job
        # scrape can take longer than the generic 15-minute user-job timeout.
        # A kill past this is no longer a loss: RQ's retry carries the same
        # run id, and the lease's owner takes its unsettled batch back at once.
        job_timeout_seconds=JOB_TIMEOUT_SECONDS,
    )
    logger.info("metric skill_floor.enqueued run_id=%s", run_id or "unknown")
    return True


@background.handler(JOB_TYPE)
async def _drain_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    """Drain every unleased floor. The empty claim that ends the loop is the proof.

    It used to re-count the gap afterwards and retry if anything was left. That
    count is a 1.5s scan that 57014'd under ingest load and turned a finished
    drain into a crashed one (2026-10-01), and with leases it would also count a
    concurrent drain's in-flight batch as "left". The six-hourly heartbeat owns
    the stall question; a drain owns only its own work.
    """
    db = get_supabase_admin_batch()
    run_id = payload.get("run_id")
    result = await asyncio.to_thread(skill_floor.drain_skill_floor_queue, db, owner=run_id)
    logger.info(
        "metric skill_floor.pipeline_done run_id=%s seen=%d written=%d empty=%d",
        run_id or "unknown",
        result["jobs_seen"],
        result["jobs_written"],
        result["jobs_empty"],
    )
