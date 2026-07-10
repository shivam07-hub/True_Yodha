"""Backlog #36 — the scrape-landed webhook that replaces the poll: scraper fires
it after writing a batch → run_sweep runs inline → per-user recompute enqueued."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.routers import internal

TOKEN = "test-scrape-token"
HEADERS = {"x-scrape-token": TOKEN}


@pytest.fixture
def wired(monkeypatch: pytest.MonkeyPatch):
    old = settings.scrape_webhook_token
    settings.scrape_webhook_token = TOKEN
    calls: dict[str, Any] = {}

    monkeypatch.setattr(internal, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(internal, "JobsRepository", lambda *_a, **_k: object())

    def _fake_sweep(_repo: Any, *, since_marker: int) -> dict[str, int]:
        calls["since_marker"] = since_marker
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


def test_default_marker_is_todays_jobs(wired: dict[str, Any]) -> None:
    with TestClient(app) as client:
        r = client.post("/internal/scrape/landed", json={}, headers=HEADERS)
    assert r.status_code == 200
    expected = int((date.today() - timedelta(days=1)).strftime("%Y%m%d"))
    assert wired["since_marker"] == expected
    body = r.json()
    assert body == {
        "new_jobs": 3, "affected_users": 2, "enqueued": 2, "since_marker": expected,
    }


def test_explicit_marker_passed_through(wired: dict[str, Any]) -> None:
    with TestClient(app) as client:
        r = client.post(
            "/internal/scrape/landed", json={"since_marker": 20260101}, headers=HEADERS
        )
    assert r.status_code == 200
    assert wired["since_marker"] == 20260101
