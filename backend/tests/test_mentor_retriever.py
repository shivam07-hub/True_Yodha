"""Tests for the Mentor retriever 'librarian' (step 5).

Mocks the embedding call and the Supabase match RPC — no network, no real model.
Asserts the mapping, the fail-soft contract, and that shelf/k flow to the RPC.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.services import mentor_retriever
from app.services.embeddings import EMBED_DIM, EmbeddingError


def _row(title="Myro CV Playbook v1", sim=0.9):
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "shelf": "cv",
        "source_id": "myro-cv-playbook-v1",
        "source_title": title,
        "source_url": None,
        "chunk_text": "Start every bullet with a strong action verb.",
        "tags": ["cv"],
        "similarity": sim,
    }


class _RPCResult:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return SimpleNamespace(data=self._data)


class _FakeClient:
    def __init__(self, data=None, raise_exc=None):
        self._data = data if data is not None else []
        self._raise = raise_exc
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        if self._raise:
            raise self._raise
        return _RPCResult(self._data)


def _patch(monkeypatch, *, client, embed=None):
    async def fake_embed(text):
        if embed is not None:
            return embed(text)
        return [0.01] * EMBED_DIM

    monkeypatch.setattr(mentor_retriever.embeddings, "embed_query", fake_embed)
    monkeypatch.setattr(mentor_retriever, "get_supabase_admin", lambda: client)


# ── happy path ──────────────────────────────────────────────────────────────────

def test_retrieve_maps_rows_to_passages(monkeypatch):
    client = _FakeClient(data=[_row(sim=0.91), _row(title="Other", sim=0.80)])
    _patch(monkeypatch, client=client)
    out = asyncio.run(mentor_retriever.retrieve("led a team", shelf="cv", k=2))
    assert len(out) == 2
    assert out[0].source_title == "Myro CV Playbook v1"
    assert out[0].citation() == "Myro CV Playbook v1"
    assert out[0].similarity == pytest.approx(0.91)
    assert out[0].chunk_text.startswith("Start every bullet")


def test_shelf_and_k_flow_to_the_rpc(monkeypatch):
    client = _FakeClient(data=[])
    _patch(monkeypatch, client=client)
    asyncio.run(mentor_retriever.retrieve("x", shelf="cv", k=5))
    name, params = client.calls[0]
    assert name == "match_playbook_chunks"
    assert params["match_shelf"] == "cv"
    assert params["match_count"] == 5
    assert params["query_embedding"].startswith("[")   # pgvector text form


# ── fail-soft contract ──────────────────────────────────────────────────────────

def test_embed_failure_returns_empty(monkeypatch):
    client = _FakeClient(data=[_row()])

    def boom(_text):
        raise EmbeddingError("no key")

    _patch(monkeypatch, client=client, embed=boom)
    assert asyncio.run(mentor_retriever.retrieve("x", shelf="cv")) == []
    assert client.calls == []   # never reached the DB


def test_rpc_failure_returns_empty(monkeypatch):
    client = _FakeClient(raise_exc=RuntimeError("pg down"))
    _patch(monkeypatch, client=client)
    assert asyncio.run(mentor_retriever.retrieve("x", shelf="cv")) == []


def test_unknown_shelf_returns_empty_without_embedding(monkeypatch):
    client = _FakeClient(data=[_row()])
    called = {"embed": False}

    async def fake_embed(text):
        called["embed"] = True
        return [0.0] * EMBED_DIM

    monkeypatch.setattr(mentor_retriever.embeddings, "embed_query", fake_embed)
    monkeypatch.setattr(mentor_retriever, "get_supabase_admin", lambda: client)
    assert asyncio.run(mentor_retriever.retrieve("x", shelf="bogus")) == []
    assert called["embed"] is False
    assert client.calls == []


def test_blank_query_returns_empty(monkeypatch):
    client = _FakeClient(data=[_row()])
    _patch(monkeypatch, client=client)
    assert asyncio.run(mentor_retriever.retrieve("   ", shelf="cv")) == []
    assert client.calls == []


def test_empty_corpus_returns_empty_list(monkeypatch):
    client = _FakeClient(data=[])
    _patch(monkeypatch, client=client)
    assert asyncio.run(mentor_retriever.retrieve("x", shelf="cv")) == []
    assert len(client.calls) == 1   # it did query; just no rows
