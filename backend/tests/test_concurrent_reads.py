"""run_concurrently's fan-out timing instrumentation.

A fan-out's wall time is max(section), so the other sections are free and which
one is the max is invisible from outside. These guard the breakdown that makes
"this endpoint is slow" answerable as "this read is slow" — and guard that the
instrumentation never changes what it measures.
"""

import logging
import time

from app.services import concurrent_reads
from app.services.concurrent_reads import SLOW_FANOUT_MS, run_concurrently


def test_returns_every_section_result_keyed_by_name() -> None:
    out = run_concurrently({"a": lambda: 1, "b": lambda: "two"})
    assert out == {"a": 1, "b": "two"}


def test_empty_sections_short_circuits() -> None:
    assert run_concurrently({}) == {}


def test_exceptions_still_propagate_to_the_caller(caplog) -> None:
    # The pre-existing contract: bundled BFF endpoints keep the same failure
    # semantics as their canonical handlers. Timing must not swallow that.
    class Boom(RuntimeError):
        pass

    def explode():
        raise Boom("nope")

    try:
        run_concurrently({"ok": lambda: 1, "bad": explode}, label="t")
    except Boom:
        pass
    else:
        raise AssertionError("exception did not propagate")


def test_slow_fanout_logs_a_breakdown_naming_the_slowest(caplog) -> None:
    slow_ms = (SLOW_FANOUT_MS + 120) / 1000.0

    def slow():
        time.sleep(slow_ms)
        return "slow"

    with caplog.at_level(logging.WARNING, logger="app.concurrent_reads"):
        out = run_concurrently(
            {"quick": lambda: "q", "heavy": slow}, label="unit.test"
        )

    assert out == {"quick": "q", "heavy": "slow"}
    assert "metric fanout.slow" in caplog.text
    assert "label=unit.test" in caplog.text
    # Naming the slowest member IS the point — a total without it just repeats
    # what the endpoint's own route.slow line already said.
    assert "slowest=heavy" in caplog.text
    assert "heavy=" in caplog.text and "quick=" in caplog.text


def test_fast_fanout_stays_silent(caplog) -> None:
    with caplog.at_level(logging.WARNING, logger="app.concurrent_reads"):
        run_concurrently({"a": lambda: 1, "b": lambda: 2}, label="fast")
    # One line per warm request would be noise, and noise gets filtered out,
    # which is how a real signal stops being read.
    assert "metric fanout.slow" not in caplog.text


def test_a_slow_section_that_raises_is_still_timed(caplog) -> None:
    # A slow FAILING read is exactly the one worth seeing, so the timing is
    # recorded in a `finally`, not on the success path.
    slow_ms = (SLOW_FANOUT_MS + 120) / 1000.0

    def slow_boom():
        time.sleep(slow_ms)
        raise RuntimeError("boom")

    with caplog.at_level(logging.WARNING, logger="app.concurrent_reads"):
        try:
            run_concurrently({"bad": slow_boom}, label="failing")
        except RuntimeError:
            pass

    assert "metric fanout.slow" in caplog.text
    assert "slowest=bad" in caplog.text


def test_sections_run_concurrently_not_sequentially() -> None:
    # The whole premise. If this ever regresses to sequential, every "wall time
    # is max(section)" claim in ARCHITECTURE_READ_PATH.md silently becomes false.
    def nap():
        time.sleep(0.15)
        return True

    started = time.perf_counter()
    run_concurrently({f"s{i}": nap for i in range(4)})
    elapsed = time.perf_counter() - started
    assert elapsed < 0.45, f"4x150ms ran in {elapsed:.2f}s — looks sequential"


def test_fanouts_reuse_one_bounded_process_pool() -> None:
    pool = concurrent_reads._READ_POOL

    assert pool._max_workers == 40
    run_concurrently({"a": lambda: 1})
    run_concurrently({"b": lambda: 2})

    assert concurrent_reads._READ_POOL is pool
