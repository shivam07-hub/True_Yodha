"""Run one bounded ATS-aware listing verification sweep.

Railway cron command:
    python -m app.workers.job_listing_verifier
"""
from __future__ import annotations

import asyncio
import logging
import os

import httpx

from app.database import get_supabase_admin
from app.repositories.job_listing_verification import ListingVerificationRepository
from app.security import install_sensitive_log_filter
from app.services.job_listing_verifier import verify_listing


log = logging.getLogger(__name__)


async def _sweep() -> None:
    limit = max(1, min(int(os.getenv("JOB_VERIFY_LIMIT", "200")), 1000))
    concurrency = max(1, min(int(os.getenv("JOB_VERIFY_CONCURRENCY", "10")), 30))
    repo = ListingVerificationRepository(get_supabase_admin())
    targets = repo.targets(limit=limit)
    semaphore = asyncio.Semaphore(concurrency)

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(15.0),
        limits=httpx.Limits(max_connections=concurrency),
    ) as client:
        async def verify_one(target):
            async with semaphore:
                return await verify_listing(target, client)

        results = await asyncio.gather(*(verify_one(target) for target in targets))

    counts: dict[str, int] = {}
    for result in results:
        repo.record(result)
        counts[result.result] = counts.get(result.result, 0) + 1
    retired = repo.retire_eligible(limit=500)
    log.info(
        "metric job_verifier.sweep targets=%d results=%s retired=%d",
        len(targets), counts, retired,
    )


async def run() -> None:
    # Best-effort cron sweep: a terminal failure (e.g. a real Supabase outage
    # outlasting the in-repo transient retries) must NOT crash-loop the service.
    # Log a loud metric — the alert hook — and exit cleanly; the next scheduled
    # tick retries against fresh upstream state.
    try:
        await _sweep()
    except Exception:  # noqa: BLE001 — terminal fallback for a best-effort sweep
        log.exception("metric job_verifier.sweep_failed")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    install_sensitive_log_filter()
    asyncio.run(run())
