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
from app.services.mentor_grounding import MentorGrounding


class _FakeProvider:
    def __init__(self, tokens: list[str]) -> None:
        self._tokens = tokens

    async def stream_complete(self, _messages: Any, **_kw: Any) -> AsyncIterator[str]:
        for t in self._tokens:
            yield t


def _frames(body: str) -> list[dict]:
    return [json.loads(c[5:].strip()) for c in body.split("\n\n") if c.strip().startswith("data:")]


async def _empty_grounding(*_a, **_k):
    return MentorGrounding()


def _wire(monkeypatch, tokens: list[str]) -> None:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="a@b.co")
    monkeypatch.setattr(skill_edit_router, "get_writer_provider", lambda: _FakeProvider(tokens))
    monkeypatch.setattr(cv_rewrite.mentor_grounding, "assemble", _empty_grounding)


def _unwire() -> None:
    app.dependency_overrides.clear()


def test_rewrite_streams_tokens_then_done(monkeypatch):
    # The streamed rewrite keeps every source number (no-DELETION guard) — 18% and Q3.
    _wire(monkeypatch, ["Cut ", "churn ", "18% ", "in Q3."])
    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/rewrite-bullet/stream",
                json={"bullet": "Reduced churn by 18% in Q3", "missing_keywords": ["churn"]},
            )
        frames = _frames(res.text)
        tokens = "".join(f.get("text", "") for f in frames if f["type"] == "token")
        done = [f for f in frames if f["type"] == "done"]
        assert tokens == "Cut churn 18% in Q3."
        assert done and done[0]["mode"] == "rewrite"
        assert done[0]["rewritten_text"] == "Cut churn 18% in Q3."
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


class _CompleteProvider:
    """Blocking provider for the variants endpoint (returns tagged lines)."""
    def __init__(self, text: str) -> None:
        self._text = text

    async def complete(self, _messages, **_kw) -> str:
        return self._text


def test_variants_endpoint_returns_finished_versions(monkeypatch):
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="a@b.co")
    # The variants endpoint resolves the writer floor INSIDE the service (not the
    # router), so patch cv_rewrite's own reference.
    monkeypatch.setattr(
        cv_rewrite, "get_writer_provider",
        lambda: _CompleteProvider(
            "[METRIC] Cut churn 18% in Q3 for the whole base\n"
            "[IMPACT] Lifted retention by cutting churn 18% in Q3\n"
            "[SCOPE] Owned the Q3 churn program end to end, cutting it 18%"
        ),
    )
    monkeypatch.setattr(cv_rewrite.mentor_grounding, "assemble", _empty_grounding)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/rewrite-bullet/variants",
                json={"bullet": "Reduced churn by 18% in Q3", "missing_keywords": ["churn"]},
            )
        body = res.json()
        assert res.status_code == 200
        assert body["mode"] == "variants"
        assert [v["angle"] for v in body["variants"]] == ["metric", "impact", "scope"]
        assert all("[" not in v["text"] for v in body["variants"])   # tags stripped, no reasoning
    finally:
        _unwire()
