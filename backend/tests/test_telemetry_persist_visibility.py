"""A telemetry write that fails must say so. It used to say nothing.

Both writes run in a `BackgroundTask` after the route has already answered 202.
The client reads nothing, so a failure reaches nobody, and FastAPI's own
background-error log does not name the table that stayed empty. That is how a
CHECK mismatch on `cv_upload_phase_events` survived seven days in which every
single `confirm` and `direction` event failed (migration 20260908b), and how
`route_perf_events` can sit at zero rows without a single complaint.

The fix is a metric, not a re-raise: re-raising a beacon's failure into a
background task moves the silence, it does not end it.
"""
from __future__ import annotations

import logging

import pytest

from app.routers import telemetry


class _Boom:
    def table(self, _name):
        return self

    def insert(self, _row):
        return self

    def execute(self):
        raise RuntimeError("PostgREST rejected the row")


class _Ok:
    def __init__(self):
        self.rows: list[tuple[str, dict]] = []
        self._table = ""

    def table(self, name):
        self._table = name
        return self

    def insert(self, row):
        self.rows.append((self._table, row))
        return self

    def execute(self):
        return self


def test_a_failed_write_is_reported_as_a_metric(monkeypatch, caplog) -> None:
    monkeypatch.setattr(telemetry, "get_supabase_admin", lambda: _Boom())
    with caplog.at_level(logging.WARNING):
        stored = telemetry._write("cv_upload_phase_events", {"phase": "direction"})
    assert stored is False
    messages = [r.getMessage() for r in caplog.records]
    assert any(
        "metric telemetry.persist_failed" in m and "cv_upload_phase_events" in m
        for m in messages
    ), f"a dropped telemetry row left no trace: {messages}"


def test_a_failed_write_never_takes_the_request_down(monkeypatch) -> None:
    # It runs after the 202. Raising here cannot reach the client and would
    # only turn a lost beacon into a lost background worker.
    monkeypatch.setattr(telemetry, "get_supabase_admin", lambda: _Boom())
    telemetry._persist_route_perf(
        telemetry.RoutePerfPayload(route="/market", ttfa_ms=120), "u1"
    )


def test_a_successful_write_lands_the_row(monkeypatch) -> None:
    client = _Ok()
    monkeypatch.setattr(telemetry, "get_supabase_admin", lambda: client)
    assert telemetry._write("route_perf_events", {"route": "/market"}) is True
    assert client.rows == [("route_perf_events", {"route": "/market"})]


def test_an_event_that_never_landed_does_not_move_the_alert_denominator(monkeypatch) -> None:
    """The CV-upload alert counts rows in this table to decide a failure RATE.

    An event that raised on insert is not in the table, so letting it count
    would dilute a real failure rate below its threshold — the one error an
    alert must never make.
    """
    monkeypatch.setattr(telemetry, "get_supabase_admin", lambda: _Boom())
    called: list[bool] = []
    monkeypatch.setattr(
        telemetry, "_maybe_emit_cv_upload_alert", lambda _p: called.append(True)
    )
    telemetry._persist_cv_upload_phase(
        telemetry.CVUploadPhasePayload(phase="put", outcome="failed"), "u1"
    )
    assert called == [], "the alert ran for an event the database never accepted"


@pytest.mark.parametrize("phase", ["confirm", "direction"])
def test_the_alert_still_runs_when_the_row_lands(monkeypatch, phase: str) -> None:
    monkeypatch.setattr(telemetry, "get_supabase_admin", lambda: _Ok())
    called: list[bool] = []
    monkeypatch.setattr(
        telemetry, "_maybe_emit_cv_upload_alert", lambda _p: called.append(True)
    )
    telemetry._persist_cv_upload_phase(
        telemetry.CVUploadPhasePayload(phase=phase, outcome="failed"), "u1"
    )
    assert called == [True]
