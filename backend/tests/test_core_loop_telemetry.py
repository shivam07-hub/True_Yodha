"""POST /v1/telemetry/loop-step — the core loop's blind steps.

On 2026-09-28 the best-jobs funnel read 44 shown -> 11 saved -> 6 tailored and
three steps in between left no record: the job panel, arriving in the CV
editor for the job, and the download. These rows are how the next reading
says where people stop.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.routers import telemetry as telemetry_module


class _Chain:
    def __init__(self) -> None:
        self.inserted: list[tuple[str, dict]] = []
        self._table = ""

    def table(self, name: str) -> "_Chain":
        self._table = name
        return self

    def insert(self, row: dict) -> "_Chain":
        self.inserted.append((self._table, row))
        return self

    def execute(self) -> None:
        return None


def _client(monkeypatch) -> tuple[TestClient, _Chain]:
    chain = _Chain()
    monkeypatch.setattr(telemetry_module, "get_supabase_admin", lambda: chain)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u-1", email=None, token="t")
    return TestClient(app), chain


def test_a_step_lands_one_row_for_the_person_and_job(monkeypatch) -> None:
    client, chain = _client(monkeypatch)
    try:
        res = client.post("/v1/telemetry/loop-step",
                          json={"step": "card_tailor", "job_id": "J1", "surface": "market"})
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 202
    ((table, row),) = chain.inserted
    assert table == "core_loop_events"
    assert (row["user_id"], row["job_id"], row["step"], row["surface"]) == (
        "u-1", "J1", "card_tailor", "market")


def test_a_step_outside_the_vocabulary_is_refused(monkeypatch) -> None:
    client, chain = _client(monkeypatch)
    try:
        res = client.post("/v1/telemetry/loop-step", json={"step": "applied", "job_id": "J1"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 422
    assert chain.inserted == []


def test_a_step_needs_a_job(monkeypatch) -> None:
    client, _ = _client(monkeypatch)
    try:
        res = client.post("/v1/telemetry/loop-step", json={"step": "downloaded", "job_id": ""})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 422


def test_a_step_needs_a_signed_in_person() -> None:
    with TestClient(app) as client:
        res = client.post("/v1/telemetry/loop-step", json={"step": "downloaded", "job_id": "J1"})
    assert res.status_code in (401, 403)
