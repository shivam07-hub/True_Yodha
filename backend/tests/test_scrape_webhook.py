"""Backlog #36 — the scrape-landed webhook. Since 2026-07-28 it ACKNOWLEDGES a
landing and matches nobody: the rows carry `ingested_at`, the user's next visit
turns that into a prompt, and the user pulls their own match. Eager fan-out is
opt-in (`sweep=true`) for a deliberate admin backfill only."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.routers import internal

TOKEN = "test-scrape-token"
HEADERS = {"x-scrape-token": TOKEN}


class _CountingRepo:
    def __init__(self, calls: dict[str, Any]) -> None:
        self._calls = calls

    def count_new_jobs_since(self, since: datetime) -> int:
        self._calls["counted_since"] = since
        return 30_043


@pytest.fixture
def wired(monkeypatch: pytest.MonkeyPatch):
    old = settings.scrape_webhook_token
    settings.scrape_webhook_token = TOKEN
    calls: dict[str, Any] = {}

    monkeypatch.setattr(internal, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(internal, "JobsRepository", lambda *_a, **_k: _CountingRepo(calls))
    monkeypatch.setattr(
        internal.skill_floor_pipeline,
        "enqueue_drain",
        lambda run_id: calls.setdefault("skill_floor_runs", []).append(run_id) or True,
    )

    def _fake_sweep(_repo: Any, *, since: datetime) -> dict[str, int]:
        calls["swept_since"] = since
        return {"new_jobs": 3, "affected_users": 2, "enqueued": 2}

    monkeypatch.setattr(internal.scrape_sweep, "run_sweep", _fake_sweep)
    yield calls
    settings.scrape_webhook_token = old


def test_requires_token(wired: dict[str, Any]) -> None:
    with TestClient(app) as client:
        assert client.post("/internal/scrape/landed", json={}).status_code == 401


def test_disabled_without_configured_token(wired: dict[str, Any]) -> None:
    settings.scrape_webhook_token = ""
    with TestClient(app) as client:
        r = client.post("/internal/scrape/landed", json={}, headers=HEADERS)
    assert r.status_code == 503


def test_landing_enqueues_skill_floor_without_matching_anyone(wired: dict[str, Any]) -> None:
    """Stage A queues because it is free; user matching stays pull-driven so a
    scrape never spends LLM budget on users who did not come back."""
    with TestClient(app) as client:
        r = client.post(
            "/internal/scrape/landed",
            json={"run_id": "20260815-feed-1"},
            headers=HEADERS,
        )

    assert r.status_code == 200
    assert "swept_since" not in wired          # nobody was matched
    body = r.json()
    assert body["new_jobs"] == 30_043
    assert body["affected_users"] == 0 and body["enqueued"] == 0
    assert body["skill_floor_enqueued"] is True
    assert wired["skill_floor_runs"] == ["20260815-feed-1"]

    # Default window is 24h of LANDINGS, not "jobs whose scrape marker is today" —
    # a batch imported the morning after its run arrives already dated yesterday.
    since = wired["counted_since"]
    assert timedelta(hours=23) < datetime.now(timezone.utc) - since < timedelta(hours=25)


def test_since_hours_widens_the_window(wired: dict[str, Any]) -> None:
    with TestClient(app) as client:
        r = client.post("/internal/scrape/landed", json={"since_hours": 72}, headers=HEADERS)
    assert r.status_code == 200
    since = wired["counted_since"]
    assert timedelta(hours=71) < datetime.now(timezone.utc) - since < timedelta(hours=73)


def test_sweep_flag_is_the_only_path_that_fans_out(wired: dict[str, Any]) -> None:
    with TestClient(app) as client:
        r = client.post("/internal/scrape/landed", json={"sweep": True}, headers=HEADERS)
    assert r.status_code == 200
    assert "swept_since" in wired
    assert r.json()["enqueued"] == 2
