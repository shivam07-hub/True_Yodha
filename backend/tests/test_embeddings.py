"""Tests for the Mentor retriever embedding helper (the "rented brain", step 2).

Mirrors test_llm_budget.py's harness: asyncio.run + SimpleNamespace fakes +
monkeypatch, no pytest-asyncio.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from openai import BadRequestError, RateLimitError

from app.services import embeddings
from app.services.embeddings import EMBED_DIM, EMBED_MODEL, EmbeddingError


# ── fakes ───────────────────────────────────────────────────────────────────────

def _resp(n_inputs: int, dim: int = EMBED_DIM, shuffled: bool = False):
    """Build an OpenAI-shaped embeddings response. embedding[i] == [float(i)]*dim
    so the caller can assert input-order preservation. `shuffled` returns the data
    out of index order to prove we sort by `.index`."""
    items = [SimpleNamespace(index=i, embedding=[float(i)] * dim) for i in range(n_inputs)]
    if shuffled:
        items = list(reversed(items))
    return SimpleNamespace(data=items)


class _Embeddings:
    def __init__(self, behaviour):
        self._behaviour = behaviour
        self.calls = 0
        self.batch_sizes: list[int] = []

    async def create(self, *, model, input):
        assert model == EMBED_MODEL
        self.calls += 1
        self.batch_sizes.append(len(input))
        result = self._behaviour(self.calls, input)
        if isinstance(result, BaseException):
            raise result
        return result


class _Client:
    def __init__(self, behaviour):
        self.embeddings = _Embeddings(behaviour)


def _rate_limit() -> RateLimitError:
    req = httpx.Request("POST", "https://x/api")
    resp = httpx.Response(429, request=req)
    return RateLimitError("rate limited", response=resp, body=None)


def _install(monkeypatch, behaviour) -> _Client:
    client = _Client(behaviour)
    monkeypatch.setattr(embeddings, "_client", client)
    return client


# ── happy path ──────────────────────────────────────────────────────────────────

def test_embed_texts_returns_vectors_in_input_order(monkeypatch):
    _install(monkeypatch, lambda call, inp: _resp(len(inp), shuffled=True))
    out = asyncio.run(embeddings.embed_texts(["a", "b", "c"]))
    assert [v[0] for v in out] == [0.0, 1.0, 2.0]
    assert all(len(v) == EMBED_DIM for v in out)


def test_embed_query_returns_single_vector(monkeypatch):
    _install(monkeypatch, lambda call, inp: _resp(len(inp)))
    vec = asyncio.run(embeddings.embed_query("hello"))
    assert len(vec) == EMBED_DIM


def test_empty_input_makes_no_api_call(monkeypatch):
    client = _install(monkeypatch, lambda call, inp: _resp(len(inp)))
    assert asyncio.run(embeddings.embed_texts([])) == []
    assert client.embeddings.calls == 0


def test_batches_over_the_api_cap(monkeypatch):
    monkeypatch.setattr(embeddings, "_MAX_BATCH", 2)
    client = _install(monkeypatch, lambda call, inp: _resp(len(inp)))
    out = asyncio.run(embeddings.embed_texts(["a", "b", "c", "d", "e"]))
    assert len(out) == 5
    assert client.embeddings.calls == 3            # 2 + 2 + 1
    assert client.embeddings.batch_sizes == [2, 2, 1]


# ── contract guards ───────────────────────────────────────────────────────────

def test_missing_key_raises_loudly(monkeypatch):
    monkeypatch.setattr(embeddings, "_client", None)
    monkeypatch.setattr(embeddings.settings, "google_api_key", "")
    with pytest.raises(EmbeddingError, match="rented"):
        asyncio.run(embeddings.embed_texts(["a"]))


def test_wrong_dimension_raises(monkeypatch):
    _install(monkeypatch, lambda call, inp: _resp(len(inp), dim=512))
    with pytest.raises(EmbeddingError, match="mismatch"):
        asyncio.run(embeddings.embed_texts(["a"]))


def test_count_mismatch_raises(monkeypatch):
    # model returns fewer vectors than inputs
    _install(monkeypatch, lambda call, inp: _resp(len(inp) - 1))
    with pytest.raises(EmbeddingError):
        asyncio.run(embeddings.embed_texts(["a", "b"]))


def test_empty_query_raises(monkeypatch):
    _install(monkeypatch, lambda call, inp: _resp(len(inp)))
    with pytest.raises(EmbeddingError, match="empty"):
        asyncio.run(embeddings.embed_query("   "))


# ── retry posture ───────────────────────────────────────────────────────────────

def test_transient_failure_retries_then_succeeds(monkeypatch):
    monkeypatch.setattr(embeddings.settings, "llm_transient_retries", 2)
    monkeypatch.setattr(embeddings.settings, "llm_retry_base_seconds", 0.0)
    monkeypatch.setattr(embeddings.settings, "llm_retry_max_seconds", 0.0)

    def behaviour(call, inp):
        if call == 1:
            return _rate_limit()
        return _resp(len(inp))

    client = _install(monkeypatch, behaviour)
    out = asyncio.run(embeddings.embed_texts(["a"]))
    assert len(out) == 1
    assert client.embeddings.calls == 2


def test_non_transient_failure_raises_without_retry(monkeypatch):
    req = httpx.Request("POST", "https://x/api")
    bad = BadRequestError("bad", response=httpx.Response(400, request=req), body=None)
    client = _install(monkeypatch, lambda call, inp: bad)
    with pytest.raises(EmbeddingError):
        asyncio.run(embeddings.embed_texts(["a"]))
    assert client.embeddings.calls == 1
