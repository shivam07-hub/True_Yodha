import asyncio
import inspect

from app.services.job_listing_verifier import VerificationResult, VerificationTarget
from app.workers import job_listing_verifier
from app.workers.job_listing_verifier import _gather_throttled, _host_of


def _target(job_id: str, url: str) -> VerificationTarget:
    return VerificationTarget(job_id, url, "Some Role")


def test_host_of_extracts_hostname() -> None:
    assert _host_of("https://boards.greenhouse.io/acme/jobs/1") == "boards.greenhouse.io"
    assert _host_of("garbage-not-a-url") == "unknown"


def test_gather_throttled_caps_per_host_concurrency() -> None:
    peak: dict[str, int] = {}
    live: dict[str, int] = {}

    async def verify(target: VerificationTarget) -> VerificationResult:
        host = _host_of(target.apply_url)
        live[host] = live.get(host, 0) + 1
        peak[host] = max(peak.get(host, 0), live[host])
        await asyncio.sleep(0.02)
        live[host] -= 1
        return VerificationResult(target.job_id, "seen_live", "strong", "greenhouse")

    targets = (
        [_target(f"g{i}", "https://boards.greenhouse.io/x") for i in range(8)]
        + [_target(f"l{i}", "https://jobs.lever.co/y") for i in range(4)]
    )

    results = asyncio.run(
        _gather_throttled(targets, verify, concurrency=10, per_host=2)
    )

    assert len(results) == 12
    # No single ATS host is ever hit by more than the per-host ceiling at once.
    assert peak["boards.greenhouse.io"] <= 2
    assert peak["jobs.lever.co"] <= 2


def test_sweep_never_counts_exact_backlogs_inline() -> None:
    """Operational progress aggregates must not compete with user reads."""

    source = inspect.getsource(job_listing_verifier._sweep)

    assert ".pending_count(" not in source
    assert ".priority_pending_count(" not in source
