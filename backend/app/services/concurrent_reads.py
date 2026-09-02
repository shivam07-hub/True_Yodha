"""Small shared primitive for latency-bounded independent repository reads."""

import logging
import time
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from typing import Any

# Same channel convention as request_timing: the `app` namespace has no handler,
# so anything below WARNING falls to logging.lastResort and is dropped. A fan-out
# breakdown that vanishes is worse than none — grep `metric fanout.slow`.
_logger = logging.getLogger("app.concurrent_reads")

# Only report fan-outs that matter. The read contract
# (ARCHITECTURE_READ_PATH.md) budgets a user-facing request at p95 < 500ms, so a
# wave at/over half that is already the interesting half of the distribution.
# Below this, one line per request would be noise on every warm cache hit.
SLOW_FANOUT_MS = 250.0

# The read contract's structural half: at most 3 concurrent DB reads per
# user-facing request. Width is what silently grows — a section is one line to
# add and its cost is invisible, because the wave's wall time is max(section)
# and the newcomer usually isn't the max. It still spends a slot of the
# process-wide read budget for the whole wave's duration, which is what turns
# "one more section" into a concurrency ceiling under load.
READ_CONTRACT_MAX_SECTIONS = 3

# One process-wide, bounded pool. The old implementation constructed and tore
# down a ThreadPoolExecutor for every fan-out. Under a concurrent arrival burst
# that multiplied threads by requests x sections even though every submitted
# task was competing for the same 40-read Supabase bulkhead. Keep scheduling
# capacity aligned with that bulkhead and reuse workers across requests.
_READ_POOL = ThreadPoolExecutor(
    max_workers=40,
    thread_name_prefix="read-fanout",
)

# Fan-outs that exceed the contract today, with the reason. Anything NOT listed
# here is held to READ_CONTRACT_MAX_SECTIONS. This is a debt register, not a
# permission slip: entries should shrink, and a new one needs a real argument.
FANOUT_BUDGET_EXCEPTIONS: dict[str, int] = {
    # ARCHITECTURE_READ_PATH.md S4: both real consumers need six of these eight,
    # and the seventh (cv_versions) seeds a cache every authed page reads, so
    # cutting it would ADD round trips. Decomposing it needs a frontend change.
    "home.bootstrap": 8,
    # S4: six independent reads, all needed for one response. Parallelised
    # rather than trimmed because each feeds a different field.
    "cv.evidence": 6,
}


def section_budget(label: str) -> int:
    return FANOUT_BUDGET_EXCEPTIONS.get(label, READ_CONTRACT_MAX_SECTIONS)


def run_concurrently(
    sections: Mapping[str, Callable[[], Any]], *, label: str = ""
) -> dict[str, Any]:
    """Return named read results with wall time bounded by the slowest read.

    Exceptions intentionally propagate from ``Future.result`` so bundled BFF
    endpoints keep the same failure semantics as their canonical handlers.

    A fan-out's wall time is ``max(section)``, which means the OTHER sections
    are free — and which one is the max is invisible from the outside. Without
    that breakdown, "this endpoint is slow" cannot be turned into "this read is
    slow", and optimising the wrong member buys nothing. Every section is timed
    and the slowest is named when the wave crosses ``SLOW_FANOUT_MS``.

    ``label`` identifies the call site in the log line. Optional so existing
    callers keep working; pass it for anything you intend to actually diagnose.
    """
    if not sections:
        return {}

    # Never raises: a contract violation is a design problem to fix in review,
    # not a reason to fail a user's request at runtime. The CI guard
    # (test_read_contract.py) is what actually blocks it from landing.
    budget = section_budget(label)
    if len(sections) > budget:
        _logger.warning(
            "metric fanout.over_budget label=%s sections=%d budget=%d | %s",
            label or "unlabelled",
            len(sections),
            budget,
            ",".join(sections),
        )

    timings: dict[str, float] = {}

    def _timed(key: str, read: Callable[[], Any]) -> Any:
        start = time.perf_counter()
        try:
            return read()
        finally:
            # `finally`, so a section that RAISES still reports its cost — a
            # slow failing read is exactly the one worth seeing.
            timings[key] = (time.perf_counter() - start) * 1000.0

    started = time.perf_counter()
    try:
        # Run each section in a COPY of the calling request's context. Without
        # this the pool threads start from a bare context and the request-scoped
        # read counter (app/services/read_budget.py) never sees a fan-out read —
        # the counter is a shared object precisely so a copied context can still
        # increment the caller's tally.
        #
        # One copy PER SECTION, not one for the wave: a Context cannot be
        # entered by two threads at once, so sharing a single copy across the
        # submits serialises the wave — which is the one thing this helper
        # exists to avoid.
        futures = {
            key: _READ_POOL.submit(copy_context().run, _timed, key, read)
            for key, read in sections.items()
        }
        return {key: future.result() for key, future in futures.items()}
    finally:
        total_ms = (time.perf_counter() - started) * 1000.0
        if total_ms >= SLOW_FANOUT_MS and timings:
            slowest_key = max(timings, key=lambda k: timings[k])
            # Sorted slowest-first: the breakdown is read to find what to fix,
            # so the answer belongs at the front of the line.
            detail = " ".join(
                f"{k}={timings[k]:.0f}ms"
                for k in sorted(timings, key=lambda k: timings[k], reverse=True)
            )
            _logger.warning(
                "metric fanout.slow label=%s total=%.0fms slowest=%s:%.0fms sections=%d | %s",
                label or "unlabelled",
                total_ms,
                slowest_key,
                timings[slowest_key],
                len(sections),
                detail,
            )
