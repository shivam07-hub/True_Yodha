"""Tests for the XP-gated deepener stream (Q8).

Covers the charge-policy branches that the SSE endpoint must get right:
cached replay (free, no LLM, no charge), first-free sample, paid charge, and
the unknown-prompt 404. Streaming bodies are collected by TestClient and the
`data: {...}` frames parsed back into events.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.routers.jobs.deepen import DEEPEN_XP_COST
from app.repositories.jobs import get_token_jobs_repository
from app.services import xp_service
from app.services.llm_provider import get_llm_provider


class _FakeProvider:
    def __init__(self, tokens: list[str]) -> None:
        self._tokens = tokens

    async def stream_complete(self, _messages: Any, **_kw: Any) -> AsyncIterator[str]:
        for t in self._tokens:
            yield t


class _FakeRepo:
    """Minimal in-memory JobsRepository stand-in for the deepener path."""

    def __init__(self, *, cached: str | None = None, sampled: bool = False) -> None:
        self._cached = cached
        self._sampled = sampled
        self.upserts: list[tuple[str, str, str, str]] = []
        self.set_sampled_calls = 0

    # deepener storage
    def list_deepenings(self, _u: str, _j: str) -> list[dict]:
        return [{"prompt_key": "lift_fit", "answer": self._cached}] if self._cached else []

    def get_deepening(self, _u: str, _j: str, _k: str) -> str | None:
        return self._cached

    def get_deepening_sampled(self, _u: str) -> bool:
        return self._sampled

    def set_deepening_sampled(self, _u: str) -> None:
        self._sampled = True
        self.set_sampled_calls += 1

    def upsert_deepening(self, u: str, j: str, k: str, text: str) -> None:
        self.upserts.append((u, j, k, text))

    # job context
    def get_all_job_skill_rows(self, job_ids: list[str]) -> list[dict]:
        return [{"job_id": job_ids[0], "skill_id": "s1", "skill_name": "Python", "is_primary": True}]

    def get_jobs_by_ids(self, _ids: list[str]) -> list[dict]:
        return [{"job_title": "Backend Engineer", "company_name": "Acme", "job_description": "Build APIs."}]

    def get_user_skill_map(self, _u: str) -> dict[str, int]:
        return {"Python": 4}


def _client(repo: _FakeRepo, provider: _FakeProvider) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="t@e.com", token="tok")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_llm_provider] = lambda: provider
    return TestClient(app)


def _events(resp: Any) -> list[dict]:
    out: list[dict] = []
    for line in resp.text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            out.append(json.loads(line[len("data:"):].strip()))
    return out


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_cached_replay_is_free_no_charge(monkeypatch):
    repo = _FakeRepo(cached="You already bought this.", sampled=True)
    charged = []
    monkeypatch.setattr(xp_service, "get_xp_balance", _aconst(3000))
    monkeypatch.setattr(xp_service, "charge_or_raise", _arecord(charged))

    resp = _client(repo, _FakeProvider(["should", "not", "run"])).post("/jobs/j1/deepen/lift_fit/stream")

    assert resp.status_code == 200
    ev = _events(resp)
    done = [e for e in ev if e["type"] == "done"]
    assert done and done[0].get("cached") is True
    assert charged == []  # replay never charges
    assert repo.upserts == []  # no re-persist


def test_first_deepener_free_sets_sampled(monkeypatch):
    repo = _FakeRepo(cached=None, sampled=False)
    charged = []
    monkeypatch.setattr(xp_service, "get_xp_balance", _aconst(3000))
    monkeypatch.setattr(xp_service, "charge_or_raise", _arecord(charged))

    resp = _client(repo, _FakeProvider(["Close ", "the ", "Rust ", "gap."])).post(
        "/jobs/j1/deepen/lift_fit/stream"
    )

    assert resp.status_code == 200
    ev = _events(resp)
    assert any(e["type"] == "done" for e in ev)
    assert repo.set_sampled_calls == 1  # free sample consumed
    assert charged == []  # first one is free
    assert repo.upserts and repo.upserts[0][3] == "Close the Rust gap."


def test_paid_deepener_charges_5xp_with_ref(monkeypatch):
    repo = _FakeRepo(cached=None, sampled=True)  # already sampled → paid path
    charged = []
    monkeypatch.setattr(xp_service, "assert_can_spend_xp", _aconst(3000))
    monkeypatch.setattr(xp_service, "charge_or_raise", _arecord(charged, ret=2995))

    resp = _client(repo, _FakeProvider(["Ahead ", "on ", "Python."])).post(
        "/jobs/j7/deepen/compare/stream"
    )

    assert resp.status_code == 200
    ev = _events(resp)
    done = [e for e in ev if e["type"] == "done"]
    assert done and done[0]["new_coin_balance"] == 2995
    assert len(charged) == 1
    args, kwargs = charged[0]
    assert args[1] == DEEPEN_XP_COST and args[2] == "deepen_job"
    assert kwargs["ref_table"] == "job_deepenings"
    assert kwargs["ref_id"] == "j7:compare"


def test_unknown_prompt_key_404(monkeypatch):
    repo = _FakeRepo()
    resp = _client(repo, _FakeProvider(["x"])).post("/jobs/j1/deepen/nonsense/stream")
    assert resp.status_code == 404


def test_list_deepenings_reports_sampled(monkeypatch):
    repo = _FakeRepo(cached="cached answer", sampled=True)
    resp = _client(repo, _FakeProvider([])).get("/jobs/j1/deepenings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sampled"] is True
    assert body["items"][0]["prompt_key"] == "lift_fit"


# ── async stub helpers ──────────────────────────────────────────────────────
def _aconst(value):
    async def _f(*_a, **_kw):
        return value
    return _f


def _arecord(sink: list, ret: int = 3000):
    async def _f(*a, **kw):
        sink.append((a, kw))
        return ret
    return _f
