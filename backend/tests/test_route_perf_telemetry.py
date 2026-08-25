"""Tests for POST /v1/telemetry/route-perf."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
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


class _CountChain:
    def __init__(self) -> None:
        self.filters: dict[str, Any] = {}

    def table(self, _name: str) -> "_CountChain":
        return self

    def select(self, *_columns: str, count: str | None = None) -> "_CountChain":
        self.filters["count"] = count
        return self

    def eq(self, column: str, value: Any) -> "_CountChain":
        self.filters[column] = value
        return self

    def gte(self, column: str, value: Any) -> "_CountChain":
        self.filters[f"{column}__gte"] = value
        return self

    def limit(self, value: int) -> "_CountChain":
        self.filters["limit"] = value
        return self

    def execute(self) -> Any:
        return type("R", (), {"count": 42, "data": [{"id": "event-1"}]})()


@pytest.fixture
def patch_admin(monkeypatch: pytest.MonkeyPatch) -> _FakeChain:
    chain = _FakeChain()
    monkeypatch.setattr(telemetry_module, "get_supabase_admin", lambda: chain)
    return chain


@pytest.fixture
def authed_client(patch_admin):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u-test", email=None, token="tok")
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
    assert res.status_code == 202
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
    assert res.status_code == 202
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


def test_record_cv_upload_phase_event(authed_client, monkeypatch: pytest.MonkeyPatch) -> None:
    client, chain = authed_client
    monkeypatch.setattr(telemetry_module, "_maybe_emit_cv_upload_alert", lambda *_args, **_kwargs: False)
    payload = {
        "phase": "put",
        "outcome": "failed",
        "attempt": 3,
        "reason_code": "upload_post_interrupted",
        "idempotency_key": "idem-123",
        "file_size_bytes": 102400,
        "file_mime": "application/pdf",
        "route": "/cv",
    }
    res = client.post("/v1/telemetry/cv-upload-phase", json=payload)
    assert res.status_code == 202
    assert res.json()["ok"] is True
    assert chain.inserted is not None
    assert chain.inserted["phase"] == "put"
    assert chain.inserted["outcome"] == "failed"
    assert chain.inserted["user_id"] == "u-test"
    assert chain.inserted["reason_code"] == "upload_post_interrupted"


def test_record_cv_upload_phase_event_validation(authed_client) -> None:
    client, _ = authed_client
    res = client.post("/v1/telemetry/cv-upload-phase", json={"phase": "unknown", "outcome": "failed"})
    assert res.status_code == 422


def test_cv_upload_event_count_uses_supabase_compatible_count_query(monkeypatch: pytest.MonkeyPatch) -> None:
    chain = _CountChain()
    monkeypatch.setattr(telemetry_module, "get_supabase_admin", lambda: chain)

    count = telemetry_module._count_cv_upload_events(
        phase="parse",
        since_iso="2026-06-01T00:00:00+00:00",
        outcome="failed",
    )

    assert count == 42
    assert chain.filters["count"] == "exact"
    assert chain.filters["phase"] == "parse"
    assert chain.filters["outcome"] == "failed"
    assert chain.filters["limit"] == 1


# --- Telemetry must not sit on the response path -----------------------------
#
# Inline, `POST /v1/telemetry/cv-upload-phase` measured 3,806-4,339ms on prod
# and landed in the same alert window as the `/cv/upload/finalize` it reports
# on. A failed phase cost three sequential round trips. These two tests fail if
# any of that work moves back in front of the response.


def test_cv_upload_phase_defers_every_read_and_write_to_background() -> None:
    from fastapi import BackgroundTasks

    calls: list[str] = []
    tasks = BackgroundTasks()
    payload = telemetry_module.CVUploadPhasePayload(phase="put", outcome="failed")

    original = telemetry_module.get_supabase_admin
    telemetry_module.get_supabase_admin = lambda: calls.append("db") or original()  # type: ignore[assignment]
    try:
        result = telemetry_module.record_cv_upload_phase(
            payload=payload,
            background_tasks=tasks,
            principal=CurrentUser(id="u-test", email=None, token="tok"),
        )
    finally:
        telemetry_module.get_supabase_admin = original  # type: ignore[assignment]

    assert result == {"ok": True}
    assert calls == [], "handler touched the database before answering"
    assert len(tasks.tasks) == 1, "the write was not deferred to a background task"
    assert tasks.tasks[0].func is telemetry_module._persist_cv_upload_phase


def test_route_perf_defers_its_write_to_background() -> None:
    from fastapi import BackgroundTasks

    calls: list[str] = []
    tasks = BackgroundTasks()
    payload = telemetry_module.RoutePerfPayload(route="/home", ttfa_ms=800)

    original = telemetry_module.get_supabase_admin
    telemetry_module.get_supabase_admin = lambda: calls.append("db") or original()  # type: ignore[assignment]
    try:
        result = telemetry_module.record_route_perf(
            payload=payload,
            background_tasks=tasks,
            principal=CurrentUser(id="u-test", email=None, token="tok"),
        )
    finally:
        telemetry_module.get_supabase_admin = original  # type: ignore[assignment]

    assert result == {"ok": True}
    assert calls == []
    assert len(tasks.tasks) == 1
    assert tasks.tasks[0].func is telemetry_module._persist_route_perf
