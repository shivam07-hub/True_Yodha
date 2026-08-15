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
from app.services.background import TransientJobError

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
        # Stage A spends zero model seconds, but each job still needs database
        # resolution + upsert round trips. A multi-thousand-job scrape can take
        # longer than the generic 15-minute user-job timeout.
        job_timeout_seconds=JOB_TIMEOUT_SECONDS,
    )
    logger.info("metric skill_floor.enqueued run_id=%s", run_id or "unknown")
    return True


@background.handler(JOB_TYPE)
async def _drain_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    """Drain every unattempted floor and prove that the work set is empty."""
    db = get_supabase_admin_batch()
    result = await asyncio.to_thread(skill_floor.drain_skill_floor_queue, db)
    after = await asyncio.to_thread(skill_floor.count_missing_floor, db)
    logger.info(
        "metric skill_floor.pipeline_done run_id=%s seen=%d written=%d empty=%d "
        "remaining=%d awaiting_stage_a=%d",
        payload.get("run_id") or "unknown",
        result["jobs_seen"],
        result["jobs_written"],
        result["jobs_empty"],
        after.total,
        after.awaiting_stage_a,
    )
    if after.awaiting_stage_a:
        message = f"Stage A drain left {after.awaiting_stage_a} unattempted jobs"
        if allow_retry:
            raise TransientJobError(message)
        logger.error("metric skill_floor.pipeline_incomplete remaining=%d", after.awaiting_stage_a)
