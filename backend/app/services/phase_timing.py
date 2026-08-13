"""Per-phase timing for a single request's SEQUENTIAL stages.

The sibling primitives cover the two ends and miss the middle:

- ``request_timing`` gives one number per request (``metric route.slow``), and
  only above 1000ms. It says a route is slow, never which part.
- ``concurrent_reads`` breaks down a CONCURRENT wave (``metric fanout.slow``),
  where wall time is ``max(section)`` and the interesting question is which
  section is the max.

Neither answers "this endpoint does four things in sequence — which one costs
the time". That gap is why ``/jobs/feed`` was invisible: it sits around 550ms,
under ``route.slow``'s 1000ms threshold, and its prelude never went through
``run_concurrently`` so no ``fanout.slow`` line existed either. A precompute was
scoped for it on an assumption about where the time went, with no measurement
behind the assumption. Rule 0 of READ_PATH_PLAYBOOK.md: a theory that has not
been measured is not a diagnosis, and a fix built on one becomes the next bug.

Here wall time is ``sum(phase)``, so EVERY phase is worth its own number — the
opposite of a fan-out, where every section but the max is free.

Usage::

    with phase_timer("jobs.feed") as t:
        with t("prelude"):
            scope = _resolve_feed_scope(...)
        with t("query"):
            page = JobQuery.feed(...)

Same channel convention as its siblings: the ``app`` namespace has no handler,
so anything below WARNING is dropped by ``logging.lastResort``. A breakdown that
vanishes is worse than none — grep ``metric phases.slow``.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager

_logger = logging.getLogger("app.phase_timing")

# Matches SLOW_FANOUT_MS. The read contract (ARCHITECTURE_READ_PATH.md) budgets a
# user-facing request at p95 < 500ms, so a request at or over half that is already
# the interesting half of the distribution. Below it, one line per request would be
# noise on every warm cache hit.
SLOW_PHASES_MS = 250.0


class _Phases:
    """Accumulates named phase durations for one request."""

    def __init__(self) -> None:
        self.timings: dict[str, float] = {}

    @contextmanager
    def __call__(self, name: str) -> Iterator[None]:
        start = time.perf_counter()
        try:
            yield
        finally:
            # `finally`, so a phase that RAISES still reports its cost — a slow
            # failing stage is exactly the one worth seeing. Re-entering the same
            # name accumulates rather than overwrites (a phase inside a loop).
            self.timings[name] = self.timings.get(name, 0.0) + (
                time.perf_counter() - start
            ) * 1000.0


@contextmanager
def phase_timer(label: str) -> Iterator[_Phases]:
    """Time a request's sequential phases; emit one line when the total is slow.

    Emits on the way out even if the body raises, for the same reason each phase
    does. ``unattributed`` is reported explicitly — time inside the block that no
    phase claimed. It is the honest guard against reading a breakdown as complete
    when it is not: four phases summing to 200ms of a 550ms request means the
    answer is in the 350ms nobody measured, and without this line that gap looks
    like it does not exist.
    """
    phases = _Phases()
    started = time.perf_counter()
    try:
        yield phases
    finally:
        total_ms = (time.perf_counter() - started) * 1000.0
        if total_ms >= SLOW_PHASES_MS and phases.timings:
            attributed = sum(phases.timings.values())
            timings = dict(phases.timings)
            unattributed = total_ms - attributed
            if unattributed > 1.0:
                timings["unattributed"] = unattributed
            slowest = max(timings, key=lambda k: timings[k])
            detail = " ".join(
                f"{k}={timings[k]:.0f}ms"
                for k in sorted(timings, key=lambda k: timings[k], reverse=True)
            )
            _logger.warning(
                "metric phases.slow label=%s total=%.0fms slowest=%s:%.0fms phases=%d | %s",
                label,
                total_ms,
                slowest,
                timings[slowest],
                len(phases.timings),
                detail,
            )
