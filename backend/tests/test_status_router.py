"""Tests for GET /v1/status."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import status as status_module


def _reset_cache() -> None:
    status_module._cache_data = None
    status_module._cache_ts = 0.0


@pytest.fixture(autouse=True)
def reset_status_cache():
    _reset_cache()
    yield
    _reset_cache()


@pytest.fixture
def patch_ping(monkeypatch: pytest.MonkeyPatch):
    def _apply(ok: bool) -> None:
        monkeypatch.setattr(status_module, "_ping_db", lambda: ok)
    return _apply


def test_status_ready(patch_ping) -> None:
    patch_ping(True)
    with TestClient(app) as client:
        res = client.get("/v1/status")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["version"]
    assert body["ts"]


def test_status_degraded_on_db_failure(patch_ping) -> None:
    patch_ping(False)
    with TestClient(app) as client:
        res = client.get("/v1/status")
    assert res.status_code == 200
    assert res.json()["status"] == "degraded"


def test_status_no_auth_required(patch_ping) -> None:
    patch_ping(True)
    with TestClient(app) as client:
        res = client.get("/v1/status")
    assert res.status_code == 200


def test_status_cache_returns_same_ts(patch_ping) -> None:
    patch_ping(True)
    with TestClient(app) as client:
        r1 = client.get("/v1/status")
        r2 = client.get("/v1/status")
    assert r1.json()["ts"] == r2.json()["ts"]


def test_status_version_dev_fallback(patch_ping, monkeypatch: pytest.MonkeyPatch) -> None:
    patch_ping(True)
    monkeypatch.setattr(status_module, "_git_version", lambda: "dev")
    with TestClient(app) as client:
        res = client.get("/v1/status")
    assert res.json()["version"] == "dev"
