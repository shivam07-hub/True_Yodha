"""Small shared primitive for latency-bounded independent repository reads."""

import logging
import time
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
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
        with ThreadPoolExecutor(max_workers=len(sections)) as pool:
            futures = {
                key: pool.submit(_timed, key, read) for key, read in sections.items()
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
