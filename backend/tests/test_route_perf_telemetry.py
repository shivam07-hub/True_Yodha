"""Tests for POST /v1/telemetry/route-perf."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers import telemetry as telemetry_module


class _FakeChain:
    def __init__(self) -> None:
        self.inserted: dict | None = None

    def table(self, _name: str) -> "_FakeChain":
        return self

    def insert(self, payload: dict) -> "_FakeChain":
        self.inserted = payload
        return self

    def execute(self) -> Any:
        return type("R", (), {"data": [self.inserted]})()


@pytest.fixture
def patch_admin(monkeypatch: pytest.MonkeyPatch) -> _FakeChain:
    chain = _FakeChain()
    monkeypatch.setattr(telemetry_module, "get_supabase_admin", lambda: chain)
    return chain


@pytest.fixture
def authed_client(patch_admin):
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u-test", "token": "tok"}
    with TestClient(app) as client:
        yield client, patch_admin
    app.dependency_overrides.clear()


def test_record_route_perf_requires_auth(patch_admin) -> None:
    with TestClient(app) as client:
        res = client.post("/v1/telemetry/route-perf", json={"route": "/home", "ttfa_ms": 800})
    assert res.status_code in (401, 403)


def test_record_route_perf_accepts_minimal_payload(authed_client) -> None:
    client, chain = authed_client
    res = client.post("/v1/telemetry/route-perf", json={"route": "/home", "ttfa_ms": 800})
    assert res.status_code == 201
    assert res.json() == {"ok": True}
    assert chain.inserted is not None
    assert chain.inserted["route"] == "/home"
    assert chain.inserted["ttfa_ms"] == 800
    assert chain.inserted["user_id"] == "u-test"


def test_record_route_perf_accepts_full_payload(authed_client) -> None:
    client, chain = authed_client
    payload = {
        "route": "/skills",
        "ttfa_ms": 620,
        "tti_cc_ms": 1800,
        "cls": 0.03,
        "deploy_id": "abc1234",
        "backend_version": "def5678",
        "viewport": "390x844",
        "session_id": "sess-xyz",
    }
    res = client.post("/v1/telemetry/route-perf", json=payload)
    assert res.status_code == 201
    assert chain.inserted["tti_cc_ms"] == 1800
    assert chain.inserted["viewport"] == "390x844"
    assert chain.inserted["cls"] == 0.03


def test_record_route_perf_missing_required_field(authed_client) -> None:
    client, _ = authed_client
    res = client.post("/v1/telemetry/route-perf", json={"route": "/home"})
    assert res.status_code == 422


def test_record_route_perf_stores_occurred_at(authed_client) -> None:
    client, chain = authed_client
    client.post("/v1/telemetry/route-perf", json={"route": "/jobs", "ttfa_ms": 950})
    assert chain.inserted is not None
    assert "occurred_at" in chain.inserted
