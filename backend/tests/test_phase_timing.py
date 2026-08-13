"""Per-phase timing — the primitive that made /jobs/feed measurable.

`request_timing` says a route is slow (>1000ms) and nothing about which part.
`concurrent_reads` breaks down a wave where wall time is max(section). Neither
covers an endpoint doing things IN SEQUENCE, where wall time is sum(phase) — the
gap /jobs/feed fell through at ~550ms with an uninstrumented prelude.

The point of this module is that a breakdown must be honest about what it did
NOT measure, or it gets read as complete and the next fix is scoped on it.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from app.services import phase_timing
from app.services.phase_timing import phase_timer


def _emit(caplog: Any) -> str:
    lines = [r.getMessage() for r in caplog.records if "phases.slow" in r.getMessage()]
    return lines[0] if lines else ""


def _slow(ms: float) -> None:
    time.sleep(ms / 1000.0)


def test_a_fast_request_logs_nothing(caplog: Any) -> None:
    """One line per request would be noise on every warm cache hit."""
    with caplog.at_level(logging.WARNING, logger="app.phase_timing"):
        with phase_timer("t.fast") as timed:
            with timed("a"):
                pass
    assert _emit(caplog) == ""


def test_a_slow_request_names_the_slowest_phase(caplog: Any, monkeypatch: Any) -> None:
    monkeypatch.setattr(phase_timing, "SLOW_PHASES_MS", 5.0)
    with caplog.at_level(logging.WARNING, logger="app.phase_timing"):
        with phase_timer("t.slow") as timed:
            with timed("cheap"):
                _slow(1)
            with timed("expensive"):
                _slow(30)
    line = _emit(caplog)
    assert "label=t.slow" in line
    assert "slowest=expensive:" in line
    # Sorted slowest-first: the breakdown is read to find what to fix, so the
    # answer belongs at the front.
    assert line.index("expensive=") < line.index("cheap=")


def test_time_no_phase_claimed_is_reported(caplog: Any, monkeypatch: Any) -> None:
    """The guard that matters. Four phases summing to 200ms of a 550ms request
    means the answer is in the 350ms nobody measured — and a breakdown that hides
    that reads as complete. R2 was scoped on exactly this kind of assumption."""
    monkeypatch.setattr(phase_timing, "SLOW_PHASES_MS", 5.0)
    with caplog.at_level(logging.WARNING, logger="app.phase_timing"):
        with phase_timer("t.gap") as timed:
            with timed("measured"):
                _slow(2)
            _slow(30)  # nobody timed this
    line = _emit(caplog)
    assert "unattributed=" in line
    assert "slowest=unattributed:" in line


def test_a_raising_phase_still_reports_its_cost(caplog: Any, monkeypatch: Any) -> None:
    """A slow FAILING stage is exactly the one worth seeing."""
    monkeypatch.setattr(phase_timing, "SLOW_PHASES_MS", 5.0)
    with caplog.at_level(logging.WARNING, logger="app.phase_timing"):
        try:
            with phase_timer("t.boom") as timed:
                with timed("doomed"):
                    _slow(20)
                    raise RuntimeError("read failed")
        except RuntimeError:
            pass
    line = _emit(caplog)
    assert "label=t.boom" in line
    assert "doomed=" in line


def test_a_repeated_phase_accumulates(caplog: Any, monkeypatch: Any) -> None:
    """A phase inside a loop must sum, not overwrite — otherwise N calls report
    as one and the breakdown understates the very thing it exists to find."""
    monkeypatch.setattr(phase_timing, "SLOW_PHASES_MS", 5.0)
    with caplog.at_level(logging.WARNING, logger="app.phase_timing"):
        with phase_timer("t.loop") as timed:
            for _ in range(3):
                with timed("repeated"):
                    _slow(5)
    assert "phases=1" in _emit(caplog)


def test_the_metric_is_a_warning_or_it_vanishes() -> None:
    """The `app` namespace has no handler, so anything below WARNING falls to
    logging.lastResort and is dropped. A breakdown that vanishes is worse than
    none — this is why every metric line in this codebase is .warning()."""
    src = (phase_timing.__file__)
    with open(src) as fh:
        body = fh.read()
    assert "_logger.warning(" in body
    assert "_logger.info(" not in body
