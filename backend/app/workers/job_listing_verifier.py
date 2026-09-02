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
from app.services.job_listing_verifier import VerificationResult, VerificationTarget, verify_listing


log = logging.getLogger(__name__)


def _host_of(url: str) -> str:
    return (urlparse(url).hostname or "").lower() or "unknown"


# A verdict that carries information about one listing. `blocked`/`timeout`/
# `error`/`unroutable` claim rows and stamp them without learning anything, so
# they must not sit in the denominator of the closure-share guard below.
_CONCLUSIVE = {"seen_live", "closed", "redirected", "wrong_role"}


def _withhold_source_failures(
    targets: list[VerificationTarget],
    results: list[VerificationResult],
    *,
    min_closed: int,
    share: float,
) -> tuple[list[VerificationResult], dict[str, int]]:
    """Demote mass per-job closures that are really one source breaking.

    Listings die one at a time; a source dies all at once. When nearly every
    conclusive verdict against a single apply-host in one run says `closed`, the
    likelier reading is that the host stopped serving listings we can address —
    a changed URL pattern, a migrated tenant, a bot wall answering 404 — and the
    per-job verdicts are an artefact of that, not 1,832 roles filled overnight.

    The guard keys on apply-host rather than company because the host is the unit
    that actually breaks: one ATS tenant, one URL contract. Withheld results
    become `source_failure`, which is inert in ``record()`` — the attempt is
    stamped, the observation is kept for forensics, and stored confidence is left
    exactly as it stood. Not-knowing is recoverable; a wrongly retired live job
    is not.
    """
    by_host: dict[str, list[str]] = {}
    for target, result in zip(targets, results):
        by_host.setdefault(_host_of(target.apply_url), []).append(result.result)

    failed_sources: dict[str, int] = {}
    for host, verdicts in by_host.items():
        closed = sum(verdict == "closed" for verdict in verdicts)
        conclusive = sum(verdict in _CONCLUSIVE for verdict in verdicts)
        if closed >= min_closed and closed >= share * conclusive:
            failed_sources[host] = closed
    if not failed_sources:
        return results, {}

    withheld = [
        VerificationResult(
            result.job_id,
            "source_failure",
            "weak",
            result.provider,
            result.status_code,
            result.final_url,
            {
                **result.evidence,
                "withheld_verdict": result.result,
                "source_host": _host_of(target.apply_url),
                "reason": "source_wide_closure_share",
            },
        )
        if result.result == "closed" and _host_of(target.apply_url) in failed_sources
        else result
        for target, result in zip(targets, results)
    ]
    return withheld, failed_sources


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
    stale_days = max(1, int(os.getenv("JOB_VERIFY_STALE_DAYS", "7")))
    priority_stale_hours = max(
        1, int(os.getenv("JOB_VERIFY_PRIORITY_STALE_HOURS", "24"))
    )
    # Ten closures is small enough to catch a broken tenant on its first sweep,
    # large enough that a genuinely tiny employer winding down does not trip it.
    guard_min = max(1, int(os.getenv("JOB_VERIFY_CLOSE_GUARD_MIN", "10")))
    guard_share = min(1.0, max(0.5, float(os.getenv("JOB_VERIFY_CLOSE_GUARD_SHARE", "0.9"))))
    repo = ListingVerificationRepository(get_supabase_admin())
    targets = repo.claim_targets(
        limit=limit,
        stale_days=stale_days,
        priority_stale_hours=priority_stale_hours,
    )
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

    results, failed_sources = _withhold_source_failures(
        targets, results, min_closed=guard_min, share=guard_share
    )
    if failed_sources:
        log.warning(
            "metric job_verifier.alert reason=source_wide_closure sources=%s withheld=%d",
            sorted(failed_sources), sum(failed_sources.values()),
        )

    counts: dict[str, int] = {}
    for result in results:
        repo.record(result)
        counts[result.result] = counts.get(result.result, 0) + 1
    retired = repo.retire_eligible(limit=500)
    # Claim throughput + productive verdicts + duration are the inline health
    # signals. Exact backlog counts used to run two corpus-wide aggregates after
    # every sweep; they are operational reporting and must never compete with a
    # user's read path. The API dead-man reads the two indexed heartbeat clocks.
    duration = round(time.monotonic() - started, 1)
    priority_targets = sum(
        target.verification_priority != "corpus" for target in targets
    )
    log.info(
        "metric job_verifier.sweep targets=%d priority_targets=%d results=%s "
        "retired=%d stale_days=%d priority_stale_hours=%d "
        "duration_s=%s",
        len(targets), priority_targets, counts, retired, stale_days,
        priority_stale_hours, duration,
    )
    _alert_on_unproductive_sweep(targets, counts)
    _refresh_skill_demand_if_changed(counts, retired)


def _refresh_skill_demand_if_changed(counts: dict[str, int], retired: int) -> None:
    """Recompute the skill-demand panel when this sweep removed listings from it.

    The panel counts live listings only, so the verifier moves its numbers as
    much as new ingest does — a skill whose roles all closed should stop being
    advertised as in demand. Gated on verdicts that actually change membership
    (`closed`, plus retirements): a sweep of `seen_live` leaves the set intact,
    and the refresh is ~9s of DB work that should not run every tick for nothing.
    """
    changed = counts.get("closed", 0) + retired
    if not changed:
        return
    from app.repositories.skill_demand import SkillDemandRepository

    try:
        summary = SkillDemandRepository(get_supabase_admin()).refresh()
        log.info(
            "metric skill_demand.refreshed trigger=verifier changed=%d cities=%d rows=%d",
            changed, summary["cities"], summary["rows_written"],
        )
    except Exception:  # noqa: BLE001 — the sweep's own work is already durable
        log.exception("metric skill_demand.refresh_failed trigger=verifier")


def _alert_on_unproductive_sweep(targets: list, counts: dict[str, int]) -> None:
    if not targets:
        return
    productive = sum(count for result, count in counts.items() if result in _CONCLUSIVE)
    if productive:
        return
    # Every claimed row burned its attempt stamp on a fetch that reached no
    # verdict — blocked, errored, unroutable, or withheld by the closure guard.
    # Left unsaid, this looks identical to a healthy sweep in the backlog trend.
    log.warning(
        "metric job_verifier.alert reason=no_productive_verdicts targets=%d results=%s",
        len(targets), counts,
    )


async def run() -> None:
    # Best-effort cron sweep: a terminal failure (e.g. a real Supabase outage
    # outlasting the in-repo transient retries) must NOT crash-loop the service.
    # Log a loud metric — the alert hook — and exit cleanly; the next scheduled
    # tick retries against fresh upstream state.
    try:
        await _sweep()
    except Exception:  # noqa: BLE001 — terminal fallback for a best-effort sweep
        log.exception("metric job_verifier.alert reason=sweep_failed")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    install_sensitive_log_filter()
    asyncio.run(run())
