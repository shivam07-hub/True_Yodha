"""Tests for POST /jobs/analyse/{job_id}/stream — ADR-0009 direct token stream.

Covers the locked guarantees: charge-on-success only, cached replay with no
re-charge, broke preflight, and no-charge on provider failure.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.routers.jobs import analyse as analyse_router
from app.services import xp_service
from app.services.llm_provider import LLMProviderError, get_llm_provider


class _FakeRepo:
    def __init__(self, *, cached: str | None = None) -> None:
        self.cached = cached
        self.upserts: list[dict[str, Any]] = []

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict]:
        return [{"is_primary": True, "skills": {"taxonomy_key": "python"}}]

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict]:
        return [{"job_title": "Engineer", "company_name": "Acme", "job_description": "Build."}]

    def get_match_explanation(self, user_id: str, job_id: str, batch_week) -> str | None:
        return self.cached

    def get_user_skill_map(self, user_id: str) -> dict[str, int]:
        return {"python": 3}

    def upsert_job_match(self, user_id: str, job_id: str, data: dict[str, Any]) -> None:
        self.upserts.append(data)


class _FakeProvider:
    def __init__(self, *, tokens: list[str] | None = None, fail: bool = False) -> None:
        self._tokens = tokens or ["Good ", "fit."]
        self._fail = fail

    async def stream_complete(self, messages, max_tokens=300, temperature=None) -> AsyncIterator[str]:
        if self._fail:
            raise LLMProviderError("boom")
        for t in self._tokens:
            yield t


def _wire(repo: _FakeRepo, provider: _FakeProvider) -> None:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="a@b.co")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_llm_provider] = lambda: provider


def _unwire() -> None:
    app.dependency_overrides.clear()


def _frames(body: str) -> list[dict]:
    out: list[dict] = []
    for chunk in body.split("\n\n"):
        chunk = chunk.strip()
        if chunk.startswith("data:"):
            out.append(json.loads(chunk[5:].strip()))
    return out


def test_stream_charges_on_success_and_persists(monkeypatch):
    repo = _FakeRepo()
    _wire(repo, _FakeProvider(tokens=["Strong ", "match."]))

    charged: dict[str, Any] = {}

    async def fake_assert(uid, amt, action):
        return 100

    async def fake_charge(uid, amt, action, *, floor=0, ref_table=None, ref_id=None):
        charged.update(amt=amt, ref_table=ref_table, ref_id=ref_id)
        return 90

    monkeypatch.setattr(xp_service, "assert_can_spend_xp", fake_assert)
    monkeypatch.setattr(xp_service, "charge_or_raise", fake_charge)

    with TestClient(app) as client:
        r = client.post("/jobs/analyse/job1/stream")
    _unwire()

    assert r.status_code == 200
    frames = _frames(r.text)
    tokens = "".join(f.get("text", "") for f in frames if f["type"] == "token")
    done = [f for f in frames if f["type"] == "done"]
    assert tokens == "Strong match."
    assert done and done[0]["new_xp_balance"] == 90
    assert charged["amt"] == 10
    assert charged["ref_table"] == "user_job_matches"
    assert len(repo.upserts) == 1
    assert repo.upserts[0]["llm_explanation"] == "Strong match."


def test_stream_cached_replays_without_charge(monkeypatch):
    repo = _FakeRepo(cached="Already analysed.")
    _wire(repo, _FakeProvider())

    async def fake_balance(uid):
        return 77

    charge_called = {"n": 0}

    async def fake_charge(*a, **k):
        charge_called["n"] += 1
        return 0

    monkeypatch.setattr(xp_service, "get_xp_balance", fake_balance)
    monkeypatch.setattr(xp_service, "charge_or_raise", fake_charge)

    with TestClient(app) as client:
        r = client.post("/jobs/analyse/job1/stream")
    _unwire()

    assert r.status_code == 200
    frames = _frames(r.text)
    tokens = "".join(f.get("text", "") for f in frames if f["type"] == "token")
    done = [f for f in frames if f["type"] == "done"]
    assert tokens == "Already analysed."
    assert done and done[0].get("cached") is True
    assert done[0]["new_xp_balance"] == 77
    assert charge_called["n"] == 0  # cached path never charges
    assert repo.upserts == []


def test_stream_provider_failure_emits_error_no_charge(monkeypatch):
    repo = _FakeRepo()
    _wire(repo, _FakeProvider(fail=True))

    async def fake_assert(uid, amt, action):
        return 100

    charge_called = {"n": 0}

    async def fake_charge(*a, **k):
        charge_called["n"] += 1
        return 0

    monkeypatch.setattr(xp_service, "assert_can_spend_xp", fake_assert)
    monkeypatch.setattr(xp_service, "charge_or_raise", fake_charge)

    with TestClient(app) as client:
        r = client.post("/jobs/analyse/job1/stream")
    _unwire()

    assert r.status_code == 200
    frames = _frames(r.text)
    errors = [f for f in frames if f["type"] == "error"]
    assert errors and errors[0]["recoverable"] is True
    assert charge_called["n"] == 0  # no charge on failure (fixes charge-on-fail bug)
    assert repo.upserts == []


def test_stream_broke_user_blocked_before_llm(monkeypatch):
    repo = _FakeRepo()
    _wire(repo, _FakeProvider())

    async def fake_assert(uid, amt, action):
        raise xp_service.InsufficientXPError(amount=amt, balance=2, action=action)

    monkeypatch.setattr(xp_service, "assert_can_spend_xp", fake_assert)

    with TestClient(app) as client:
        r = client.post("/jobs/analyse/job1/stream")
    _unwire()

    assert r.status_code == 400
    assert repo.upserts == []
