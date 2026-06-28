"""Tests for POST /cv/rewrite-bullet/stream — ADR-0009 streamed Mentor rewrite.

The streaming twin of /cv/rewrite-bullet: a real rewrite streams `token`s then a
terminal `done {mode:"rewrite", …}`; the no-fabrication guard returns a single
`done {mode:"question"}` (no tokens); a pre-stream failure returns one `error`.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers.cv import skill_edit as skill_edit_router
from app.services import cv_rewrite


class _FakeProvider:
    def __init__(self, tokens: list[str]) -> None:
        self._tokens = tokens

    async def stream_complete(self, _messages: Any, **_kw: Any) -> AsyncIterator[str]:
        for t in self._tokens:
            yield t


def _frames(body: str) -> list[dict]:
    return [json.loads(c[5:].strip()) for c in body.split("\n\n") if c.strip().startswith("data:")]


def _wire(monkeypatch, tokens: list[str]) -> None:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="a@b.co")
    monkeypatch.setattr(skill_edit_router, "get_llm_provider", lambda: _FakeProvider(tokens))

    async def _no_passages(*_a, **_k):
        return []

    monkeypatch.setattr(cv_rewrite.mentor_retriever, "retrieve", _no_passages)


def _unwire() -> None:
    app.dependency_overrides.clear()


def test_rewrite_streams_tokens_then_done(monkeypatch):
    _wire(monkeypatch, ["Cut ", "churn ", "18%."])
    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/rewrite-bullet/stream",
                json={"bullet": "Reduced churn by 18% in Q3", "missing_keywords": ["churn"]},
            )
        frames = _frames(res.text)
        tokens = "".join(f.get("text", "") for f in frames if f["type"] == "token")
        done = [f for f in frames if f["type"] == "done"]
        assert tokens == "Cut churn 18%."
        assert done and done[0]["mode"] == "rewrite"
        assert done[0]["rewritten_text"] == "Cut churn 18%."
        assert "citations" in done[0]
    finally:
        _unwire()


def test_no_metric_returns_question_frame_no_tokens(monkeypatch):
    _wire(monkeypatch, ["unused"])
    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/rewrite-bullet/stream",
                json={"bullet": "Owned the product roadmap", "missing_keywords": []},
            )
        frames = _frames(res.text)
        assert not any(f["type"] == "token" for f in frames)   # no prose to type
        done = [f for f in frames if f["type"] == "done"]
        assert done and done[0]["mode"] == "question" and done[0]["question"]
    finally:
        _unwire()


def test_empty_bullet_returns_error_frame(monkeypatch):
    _wire(monkeypatch, ["unused"])
    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/rewrite-bullet/stream",
                json={"bullet": "   ", "missing_keywords": []},
            )
        # min_length=1 lets whitespace through; prepare_rewrite strips → error.
        frames = _frames(res.text)
        errs = [f for f in frames if f["type"] == "error"]
        assert errs and not any(f["type"] == "token" for f in frames)
    finally:
        _unwire()
