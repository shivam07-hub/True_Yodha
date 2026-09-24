"""Per-route latency buckets: countable, summable, bounded.

The middleware flagged one request over 1,000ms and nothing else, so a route
drifting from 200ms to 900ms was invisible and the read contract — a p95 —
had no per-route number at all.

Percentiles cannot be added, which is the whole reason this emits COUNTS: two
processes each reporting "p95=800" cannot be combined into anything true, while
their bucket counts sum exactly. Same rule `role_family_scope` follows.
"""
from __future__ import annotations

import logging

import pytest

from app import route_latency


@pytest.fixture(autouse=True)
def _clean():
    route_latency.reset()
    yield
    route_latency.reset()


def _record(n: int, ms: float, route: str = "/users/me") -> None:
    for _ in range(n):
        route_latency.record("GET", route, ms, now=0.0)


def test_a_response_lands_in_exactly_one_bucket() -> None:
    _record(1, 120)
    slot = route_latency.snapshot()[("GET", "/users/me")]
    assert sum(slot) == 1
    assert slot[route_latency._bucket(120)] == 1


def test_the_boundary_belongs_to_the_bucket_above_it() -> None:
    # 500 is the contract line. A request AT 500ms is not under budget.
    assert route_latency._bucket(499.9) != route_latency._bucket(500.0)


def test_counts_from_two_windows_sum() -> None:
    # The property the whole design rests on: this is what a log query does
    # across processes and across flush windows.
    _record(3, 80)
    first = route_latency.snapshot()[("GET", "/users/me")]
    route_latency.reset()
    _record(2, 80)
    second = route_latency.snapshot()[("GET", "/users/me")]
    assert sum(a + b for a, b in zip(first, second)) == 5


def test_one_line_per_route_carries_the_counts(caplog) -> None:
    _record(10, 80)
    _record(2, 4000, route="/jobs/feed")
    with caplog.at_level(logging.WARNING):
        route_latency.flush()
    lines = [r.getMessage() for r in caplog.records]
    assert any("metric route.latency" in m and "/users/me" in m and "n=10" in m for m in lines)
    assert any("/jobs/feed" in m and "n=2" in m for m in lines), lines


def test_a_flush_empties_the_window() -> None:
    _record(4, 80)
    route_latency.flush()
    assert route_latency.snapshot() == {}, "a window counted twice doubles every number"


def test_the_reported_percentile_is_a_bucket_edge_never_interpolated() -> None:
    # The histogram does not hold the precision an interpolated figure implies;
    # reporting one would invent accuracy we cannot defend.
    _record(95, 80)
    _record(5, 4000)
    slot = route_latency.snapshot()[("GET", "/users/me")]
    assert route_latency._percentile(slot, 0.50) == "100"
    assert route_latency._percentile(slot, 0.95) in {"100", "5000"}


def test_an_empty_route_is_not_logged(caplog) -> None:
    with caplog.at_level(logging.WARNING):
        route_latency.flush()
    assert [r for r in caplog.records if "route.latency" in r.getMessage()] == []


def test_the_window_flushes_only_when_due() -> None:
    _record(1, 80)
    assert route_latency.flush_if_due(now=0.0) is False
    assert route_latency.flush_if_due(now=route_latency.FLUSH_SECONDS + 1) is True


def test_unmatched_paths_cannot_grow_without_bound() -> None:
    # A 404 carries no route template, so it keeps its raw path. A crawler can
    # vary that forever; dropping the measurement is correct, dropping the
    # process is not.
    for i in range(route_latency.MAX_TRACKED_ROUTES + 50):
        route_latency.record("GET", f"/404/{i}", 10, now=0.0)
    assert len(route_latency.snapshot()) == route_latency.MAX_TRACKED_ROUTES


def test_recording_never_raises_on_an_extreme_value() -> None:
    for ms in (0.0, -1.0, 1e9):
        route_latency.record("GET", "/x", ms, now=0.0)
    assert sum(route_latency.snapshot()[("GET", "/x")]) == 3
