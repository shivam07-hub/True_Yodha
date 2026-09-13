"""The Career Story Reservoir's inflow sweep — a heal that nobody has to visit.

`retry_stale_ingests` re-enqueues a dead ingest, and it is called from exactly
one place: the `/cv/reservoir/profile` read. That makes healing a side effect of
opening the Stories tab. A user who answers a gap and never goes back to Stories
— which is most of them, since the answer is given inside a job room — has a
career story that simply never arrives. Three of them sat pending for two months
that way.

So the same heal runs on a schedule instead. The Work Lane (ADR-0008) runs the
sweep; the web process holds the clock, because it is the always-up process and
a worker cannot schedule work that proves the worker is running.

Terminal, not eternal: an entry the extractor can never read would otherwise be
re-enqueued hourly forever, spending a paid provider call each time. Attempts are
counted in the entry's own payload, and the last one closes it with a reason
rather than leaving it to cycle — a give-up must leave a receipt.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services import background

logger = logging.getLogger("myro.reservoir_sweep")

JOB_TYPE = "reservoir_ingest_sweep"

# Matches career_reservoir._REQUEUE_AFTER_SECONDS: a live ingest finishes in
# 15-45s, so anything still pending after 15 minutes is not slow, it is gone.
STALE_AFTER_SECONDS = 15 * 60

# The clock. A backstop, not a pipeline — prod has produced five stale inflows in
# two months. Shortening this does not make a dead job recover faster (the entry
# is already lost by minute 15); it only multiplies the scan.
SWEEP_INTERVAL_SECONDS = 60 * 60

# How many entries one sweep may re-enqueue. Bounds a cold start on a backlog.
SWEEP_LIMIT = 200

# Re-enqueues before an entry is declared unreadable and closed with a reason.
# Three hourly attempts is enough to outlive a deploy, a queue flush and a
# provider outage; a fourth would be answering the same question again.
MAX_SWEEP_ATTEMPTS = 3


def _cutoff_iso(now: datetime | None = None) -> str:
    moment = now or datetime.now(timezone.utc)
    return (moment - timedelta(seconds=STALE_AFTER_SECONDS)).isoformat()


def sweep(repo: Any, *, now: datetime | None = None) -> dict[str, int]:
    """Re-enqueue every user's stale pending inflow. Returns what it did.

    Pure of scheduling and of the queue's shape: the caller supplies an
    admin-scoped repository, so this is the same function the test drives.
    """
    from app.services import career_reservoir

    requeued = 0
    abandoned = 0
    rows = repo.stale_pending_inflows(_cutoff_iso(now), limit=SWEEP_LIMIT)
    for row in rows:
        entry_id = str(row.get("id") or "")
        user_id = str(row.get("user_id") or "")
        if not entry_id or not user_id:
            continue
        payload = dict(row.get("payload") or {})
        attempts = int(payload.get("sweep_attempts") or 0)
        if attempts >= MAX_SWEEP_ATTEMPTS:
            repo.mark_skipped(user_id, entry_id, payload, "ingest_unreadable")
            abandoned += 1
            logger.warning(
                "metric reservoir_sweep.abandoned user=%s entry=%s attempts=%d",
                user_id, entry_id, attempts,
            )
            continue
        # Count the attempt BEFORE enqueuing. A crash between the two costs one
        # wasted attempt; the reverse costs an entry that is swept forever.
        repo.set_entry_payload(user_id, entry_id, {**payload, "sweep_attempts": attempts + 1})
        career_reservoir.enqueue_ingest(user_id, entry_id)
        requeued += 1

    logger.info(
        "metric reservoir_sweep.done seen=%d requeued=%d abandoned=%d",
        len(rows), requeued, abandoned,
    )
    return {"seen": len(rows), "requeued": requeued, "abandoned": abandoned}


def enqueue_sweep() -> None:
    """One sweep onto the bulk lane. No correlation id: two replicas each asking
    for a sweep is two harmless scans, and de-duplicating them by job id would
    make a second replica's request silently replace the first one's."""
    background.enqueue(background.LANE_BULK, JOB_TYPE, payload={})


@background.handler(JOB_TYPE)
async def _sweep_handler(payload: dict[str, Any], allow_retry: bool) -> None:  # noqa: ARG001
    from app.database import get_supabase_admin
    from app.repositories.career_reservoir import CareerReservoirRepository

    repo = CareerReservoirRepository(get_supabase_admin())
    await asyncio.to_thread(sweep, repo)


async def run_forever() -> None:  # pragma: no cover — the loop itself is the schedule
    """The clock. A failed sweep must never take the web process with it."""
    while True:
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
        try:
            enqueue_sweep()
        except Exception:
            logger.exception("reservoir ingest sweep enqueue failed")
