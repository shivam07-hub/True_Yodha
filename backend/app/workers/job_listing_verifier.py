"""Run one bounded ATS-aware listing verification sweep.

Railway cron command:
    python -m app.workers.job_listing_verifier
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

import httpx

from app.database import get_supabase_admin
from app.repositories.job_listing_verification import ListingVerificationRepository
from app.security import install_sensitive_log_filter
from app.services.collection_attention import sweep_collection_attention
from app.services.job_listing_verifier import VerificationResult, VerificationTarget, verify_listing


log = logging.getLogger(__name__)


def _host_of(url: str) -> str:
    return (urlparse(url).hostname or "").lower() or "unknown"


async def _gather_throttled(
    targets: list[VerificationTarget],
    verify: Callable[[VerificationTarget], Awaitable[VerificationResult]],
    *,
    concurrency: int,
    per_host: int,
) -> list[VerificationResult]:
    """Verify targets under two ceilings: a global cap AND a per-apply-host cap.

    Many targets share an ATS host (greenhouse.io, lever.co, LinkedIn). Firing
    the full global fan-out at one host gets Myro rate-limited or IP-blocked, so
    each host also gets its own semaphore. This is the gate that makes a tight
    cron cadence safe.
    """
    global_sem = asyncio.Semaphore(concurrency)
    host_sems: dict[str, asyncio.Semaphore] = {}

    async def one(target: VerificationTarget) -> VerificationResult:
        host_sem = host_sems.setdefault(_host_of(target.apply_url), asyncio.Semaphore(per_host))
        async with global_sem, host_sem:
            return await verify(target)

    return await asyncio.gather(*(one(target) for target in targets))


async def _sweep() -> None:
    limit = max(1, min(int(os.getenv("JOB_VERIFY_LIMIT", "200")), 1000))
    concurrency = max(1, min(int(os.getenv("JOB_VERIFY_CONCURRENCY", "10")), 30))
    per_host = max(1, min(int(os.getenv("JOB_VERIFY_PER_HOST", "4")), concurrency))
    repo = ListingVerificationRepository(get_supabase_admin())
    targets = repo.targets(limit=limit)
    started = time.monotonic()

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(15.0),
        limits=httpx.Limits(max_connections=concurrency),
    ) as client:
        results = await _gather_throttled(
            targets,
            lambda target: verify_listing(target, client),
            concurrency=concurrency,
            per_host=per_host,
        )

    counts: dict[str, int] = {}
    for result in results:
        repo.record(result)
        counts[result.result] = counts.get(result.result, 0) + 1
    retired = repo.retire_eligible(limit=500)
    attention = sweep_collection_attention(get_supabase_admin())
    # backlog + rate + duration are the health signals: a draining belt trends
    # backlog down; a stalled one is visible before users hit a ghost listing.
    duration = round(time.monotonic() - started, 1)
    backlog = repo.pending_count()
    log.info(
        "metric job_verifier.sweep targets=%d results=%s retired=%d attention=%d backlog=%d duration_s=%s",
        len(targets), counts, retired, attention, backlog, duration,
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
