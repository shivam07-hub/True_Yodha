"""Tests for the ADR-0009 PR2 SSE relay endpoints.

GET /jobs/refresh/{ticket}/stream  — snapshot-watch over Job Refresh state.
GET /cv/skill-edit/recompute-status/{baseline_id}/stream — over the recompute flag.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.routers.cv import skill_edit as skill_edit_router
from app.routers.jobs import match as match_router
from app.services import progress_stream
from app.services.job_refresh.types import RefreshState


@pytest.fixture(autouse=True)
def _fast_tick(monkeypatch):
    # Don't actually sleep 0.7s between relay ticks during tests.
    monkeypatch.setattr(progress_stream, "TICK_SECONDS", 0.0)


def _frames(body: str) -> list[dict]:
    out: list[dict] = []
    for chunk in body.split("\n\n"):
        chunk = chunk.strip()
        if chunk.startswith("data:"):
            out.append(json.loads(chunk[5:].strip()))
    return out


def _state(life: str, **kw: Any) -> RefreshState:
    return RefreshState(
        ticket_id="t1",
        state=life,
        progress_label=kw.get("progress_label", life),
        batch_week=date(2026, 5, 25),
        matches_written=kw.get("matches_written"),
        refund=kw.get("refund"),
        new_xp_balance=kw.get("new_xp_balance"),
        outcome_kind=kw.get("outcome_kind"),
        error=kw.get("error"),
        debug={},
        progress_done=kw.get("progress_done"),
        progress_total=kw.get("progress_total"),
        revealed=kw.get("revealed") or [],
    )


def test_refresh_stream_phase_then_done(monkeypatch):
    seq = [_state("computing"), _state("computing", progress_label="Ranking"),
           _state("done", matches_written=7, new_xp_balance=90, outcome_kind="ok")]

    async def fake_status(user_id, ticket_id):
        return seq.pop(0)

    monkeypatch.setattr(match_router.JobRefresh, "status", staticmethod(fake_status))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")

    with TestClient(app) as client:
        r = client.get("/jobs/refresh/t1/stream")
    app.dependency_overrides.clear()

    assert r.status_code == 200
    frames = _frames(r.text)
    phases = [f for f in frames if f["type"] == "phase"]
    done = [f for f in frames if f["type"] == "done"]
    assert len(phases) == 2  # computing → Ranking (label change)
    assert done and done[0]["result"]["matches_written"] == 7
    assert done[0]["result"]["new_xp_balance"] == 90


def test_refresh_stream_emits_per_job_progress(monkeypatch):
    seq = [
        _state("computing", progress_done=1, progress_total=3,
               revealed=[{"title": "Eng", "company": "Acme"}]),
        _state("computing", progress_done=2, progress_total=3,
               revealed=[{"title": "Eng", "company": "Acme"}, {"title": "SRE", "company": "Beta"}]),
        _state("done", matches_written=3, new_xp_balance=90),
    ]

    async def fake_status(user_id, ticket_id):
        return seq.pop(0)

    monkeypatch.setattr(match_router.JobRefresh, "status", staticmethod(fake_status))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")

    with TestClient(app) as client:
        r = client.get("/jobs/refresh/t1/stream")
    app.dependency_overrides.clear()

    frames = _frames(r.text)
    progress = [f for f in frames if f["type"] == "progress"]
    assert [p["done"] for p in progress] == [1, 2]
    assert progress[0]["total"] == 3
    assert progress[1]["revealed"][-1]["title"] == "SRE"
    assert any(f["type"] == "done" for f in frames)


def test_refresh_stream_failed_emits_error(monkeypatch):
    async def fake_status(user_id, ticket_id):
        return _state("failed", error="boom", refund=20, new_xp_balance=120)

    monkeypatch.setattr(match_router.JobRefresh, "status", staticmethod(fake_status))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")

    with TestClient(app) as client:
        r = client.get("/jobs/refresh/t1/stream")
    app.dependency_overrides.clear()

    frames = _frames(r.text)
    errors = [f for f in frames if f["type"] == "error"]
    assert errors and errors[0]["recoverable"] is True
    assert errors[0]["result"]["new_xp_balance"] == 120


def test_refresh_stream_unknown_ticket(monkeypatch):
    async def fake_status(user_id, ticket_id):
        raise HTTPException(status_code=404, detail="nope")

    monkeypatch.setattr(match_router.JobRefresh, "status", staticmethod(fake_status))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")

    with TestClient(app) as client:
        r = client.get("/jobs/refresh/t1/stream")
    app.dependency_overrides.clear()

    frames = _frames(r.text)
    assert frames == [{"type": "error", "recoverable": False, "message": "Unknown refresh ticket."}]


class _FakeCVRepo:
    def __init__(self, rows: list[dict | None]) -> None:
        self._rows = rows

    def find(self, version_id: int, user_id: str) -> dict | None:
        return self._rows.pop(0) if self._rows else self._rows_last

    @property
    def _rows_last(self):
        return None


def test_recompute_stream_phase_then_done(monkeypatch):
    rows = [{"recompute_finished_at": None}, {"recompute_finished_at": "2026-05-30T00:00:00Z"}]
    repo = _FakeCVRepo(rows)

    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_cv_repository] = lambda: repo

    with TestClient(app) as client:
        r = client.get("/cv/skill-edit/recompute-status/55/stream")
    app.dependency_overrides.clear()

    assert r.status_code == 200
    frames = _frames(r.text)
    assert any(f["type"] == "phase" and f["phase"] == "scoring" for f in frames)
    done = [f for f in frames if f["type"] == "done"]
    assert done and done[0]["result"]["recompute_finished_at"] == "2026-05-30T00:00:00Z"


def test_recompute_stream_missing_baseline(monkeypatch):
    repo = _FakeCVRepo([None])
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_cv_repository] = lambda: repo

    with TestClient(app) as client:
        r = client.get("/cv/skill-edit/recompute-status/55/stream")
    app.dependency_overrides.clear()

    frames = _frames(r.text)
    assert frames == [{"type": "error", "recoverable": False, "message": "Baseline not found."}]
