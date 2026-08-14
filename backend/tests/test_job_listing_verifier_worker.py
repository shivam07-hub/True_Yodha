import asyncio
import inspect

from app.services.job_listing_verifier import VerificationResult, VerificationTarget
from app.workers import job_listing_verifier
from app.workers.job_listing_verifier import (
    _gather_throttled,
    _host_of,
    _withhold_source_failures,
)


def _target(job_id: str, url: str) -> VerificationTarget:
    return VerificationTarget(job_id, url, "Some Role")


def _verdict(job_id: str, result: str) -> VerificationResult:
    return VerificationResult(job_id, result, "strong", "workday", 404)


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


def test_one_host_closing_everything_is_read_as_a_source_failure() -> None:
    """Accenture did not close 1,832 openings in 48 hours."""
    host = "https://accenture.wd103.myworkdayjobs.com/job/Chennai/Role"
    targets = [_target(f"a{i}", host) for i in range(12)]
    results = [_verdict(f"a{i}", "closed") for i in range(12)]

    withheld, failed = _withhold_source_failures(
        targets, results, min_closed=10, share=0.9
    )

    assert failed == {"accenture.wd103.myworkdayjobs.com": 12}
    assert {result.result for result in withheld} == {"source_failure"}
    assert withheld[0].evidence["withheld_verdict"] == "closed"


def test_a_host_still_serving_live_listings_keeps_its_closures() -> None:
    """Real churn closes some of a host's roles, never nearly all of them."""
    host = "https://acme.wd5.myworkdayjobs.com/Careers/job/Pune/Role"
    targets = [_target(f"a{i}", host) for i in range(20)]
    results = [
        _verdict(f"a{i}", "closed" if i < 12 else "seen_live") for i in range(20)
    ]

    withheld, failed = _withhold_source_failures(
        targets, results, min_closed=10, share=0.9
    )

    assert failed == {}
    assert [result.result for result in withheld] == [
        result.result for result in results
    ]


def test_a_small_host_closing_out_stays_below_the_guard() -> None:
    """A three-role employer winding down is not a broken source."""
    host = "https://tiny.wd1.myworkdayjobs.com/Careers/job/Pune/Role"
    targets = [_target(f"a{i}", host) for i in range(3)]
    results = [_verdict(f"a{i}", "closed") for i in range(3)]

    withheld, failed = _withhold_source_failures(
        targets, results, min_closed=10, share=0.9
    )

    assert failed == {}
    assert {result.result for result in withheld} == {"closed"}


def test_guard_scopes_the_withholding_to_the_failing_host() -> None:
    """One broken tenant must not suppress another host's honest verdicts."""
    broken = "https://broken.wd1.myworkdayjobs.com/job/Pune/Role"
    healthy = "https://healthy.wd1.myworkdayjobs.com/Careers/job/Pune/Role"
    targets = [_target(f"b{i}", broken) for i in range(11)] + [
        _target("h0", healthy),
        _target("h1", healthy),
    ]
    results = [_verdict(f"b{i}", "closed") for i in range(11)] + [
        _verdict("h0", "closed"),
        _verdict("h1", "seen_live"),
    ]

    withheld, failed = _withhold_source_failures(
        targets, results, min_closed=10, share=0.9
    )

    assert set(failed) == {"broken.wd1.myworkdayjobs.com"}
    assert [result.result for result in withheld[-2:]] == ["closed", "seen_live"]


def test_inconclusive_verdicts_do_not_dilute_the_closure_share() -> None:
    """`blocked`/`unroutable` learn nothing, so they cannot vouch for a host."""
    host = "https://accenture.wd103.myworkdayjobs.com/job/Chennai/Role"
    targets = [_target(f"a{i}", host) for i in range(30)]
    results = [
        _verdict(f"a{i}", "closed" if i < 10 else "blocked") for i in range(30)
    ]

    _, failed = _withhold_source_failures(targets, results, min_closed=10, share=0.9)

    assert failed == {"accenture.wd103.myworkdayjobs.com": 10}


def test_sweep_never_counts_exact_backlogs_inline() -> None:
    """Operational progress aggregates must not compete with user reads."""

    source = inspect.getsource(job_listing_verifier._sweep)

    assert ".pending_count(" not in source
    assert ".priority_pending_count(" not in source
