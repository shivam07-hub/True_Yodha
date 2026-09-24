"""Per-route latency as BUCKET COUNTS, emitted to the log every few minutes.

`RequestTimingMiddleware` already flags a single request over 1,000ms. That
finds a spark, not a fire: a route that drifts from 200ms to 900ms never trips
it, and the read contract (p95 < 500ms) had no per-route number at all — §16 of
ARCHITECTURE_READ_PATH ranks routes by how often they cross the 1s alert, which
is a count of the tail and says nothing about the shape below it.

**Why counts, and why the log.**

- *Counts, not percentiles.* Percentiles cannot be added up. Every process
  keeps its own histogram, so a p95 emitted per process is a p95 of a slice,
  and averaging those is meaningless. Bucket counts sum — across processes,
  across windows — and the real p95 is computed from the summed buckets. This
  is the rule `role_family_scope` already follows: counts, never ratios.
- *The log, not a table.* The database is the constrained resource
  (BACKLOG #16) and this would write on the read path it is measuring. The
  repo already aggregates this way — `railway logs → grep "metric fanout.slow"`.
- *WARNING, not INFO.* The `app` namespace has no INFO handler; anything below
  WARNING is dropped (READ_PATH_PLAYBOOK, "hard-won constraints").

**What this is NOT.** Railway's own `http-response-time` already gives p50/p95
per path at the edge, and it is the better number for "what did the user wait
for" — it includes queueing and network. This measures SERVER time only. The
two are complementary and the gap between them IS the queueing; neither
replaces the other, and a bucketed table duplicating Railway's edge metric was
considered and deliberately not built.
"""
from __future__ import annotations

import logging
import time

_logger = logging.getLogger("app.request_timing")

#: Upper edges in ms. Dense where the contract lives (500ms) and coarse in the
#: tail, where a request is already over budget and the exact number is noise.
BUCKET_EDGES_MS: tuple[float, ...] = (
    50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 8000, float("inf"),
)

#: How often a process empties its histogram into the log.
FLUSH_SECONDS = 300.0

#: A safety ceiling on distinct (method, route) keys. Route TEMPLATES are
#: bounded by the router, but a 404 carries no template and falls back to the
#: raw path, which an attacker or a crawler can vary without limit.
MAX_TRACKED_ROUTES = 300

_counts: dict[tuple[str, str], list[int]] = {}
_last_flush = time.monotonic()


def _bucket(ms: float) -> int:
    for index, edge in enumerate(BUCKET_EDGES_MS):
        if ms < edge:
            return index
    return len(BUCKET_EDGES_MS) - 1


def record(method: str, route: str, elapsed_ms: float, *, now: float | None = None) -> None:
    """Count one response, and flush the window if it is due.

    Called from the response path, so it does a dict lookup and an increment —
    no I/O, no lock. Under asyncio there is no await between read and write, so
    the increment cannot interleave.
    """
    key = (method, route)
    slot = _counts.get(key)
    if slot is None:
        if len(_counts) >= MAX_TRACKED_ROUTES:
            # Never grow without bound. Dropping the measurement is correct;
            # dropping the process is not.
            return
        slot = [0] * len(BUCKET_EDGES_MS)
        _counts[key] = slot
    slot[_bucket(elapsed_ms)] += 1
    flush_if_due(now=now)


def flush_if_due(*, now: float | None = None) -> bool:
    global _last_flush
    now = time.monotonic() if now is None else now
    if now - _last_flush < FLUSH_SECONDS:
        return False
    _last_flush = now
    flush()
    return True


def flush() -> None:
    """One line per route. Counts, so a log query can sum them across processes."""
    for (method, route), slot in sorted(_counts.items()):
        total = sum(slot)
        if not total:
            continue
        buckets = ",".join(
            f"{_edge_label(index)}:{count}" for index, count in enumerate(slot) if count
        )
        _logger.warning(
            "metric route.latency method=%s path=%s n=%d p50=%s p95=%s buckets=%s",
            method, route, total, _percentile(slot, 0.50), _percentile(slot, 0.95), buckets,
        )
    _counts.clear()


def _edge_label(index: int) -> str:
    edge = BUCKET_EDGES_MS[index]
    return "inf" if edge == float("inf") else str(int(edge))


def _percentile(slot: list[int], quantile: float) -> str:
    """The bucket this process's own quantile falls in — a convenience only.

    The TRUE percentile comes from summing `buckets=` across every process and
    window; this is here so one line is readable on its own without arithmetic.
    Reported as the bucket's upper edge, never interpolated: the histogram does
    not hold the precision an interpolated figure would imply.
    """
    total = sum(slot)
    if not total:
        return "-"
    target = quantile * total
    seen = 0
    for index, count in enumerate(slot):
        seen += count
        if seen >= target:
            return _edge_label(index)
    return _edge_label(len(slot) - 1)


def reset(*, now: float = 0.0) -> None:
    """Test seam — drops the window and the histogram.

    `now` defaults to 0.0 rather than the real monotonic clock so a test can
    drive the window with synthetic timestamps. Only tests call this.
    """
    global _last_flush
    _counts.clear()
    _last_flush = now


def snapshot() -> dict[tuple[str, str], list[int]]:
    """Test seam — the live histogram, copied."""
    return {key: list(value) for key, value in _counts.items()}
