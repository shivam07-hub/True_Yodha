"""Unit tests for the text_stream module — the one ADR-0009 SSE seam.

The streaming contract (token/done/error envelope, empty guard, provider-failure
mapping, charge-only-on-done via finalize) lives here now instead of inlined in
each router, so it's tested once against a fake provider.
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from app.services import text_stream
from app.services.llm_provider import LLMProviderError


class _FakeProvider:
    def __init__(self, *, tokens: list[str] | None = None, fail: bool = False) -> None:
        self._tokens = tokens if tokens is not None else ["Hello ", "world."]
        self._fail = fail

    async def stream_complete(self, messages, max_tokens=200, temperature=None) -> AsyncIterator[str]:
        if self._fail:
            raise LLMProviderError("boom")
        for t in self._tokens:
            yield t


def _drain(aiter) -> list[dict]:
    async def run() -> list[dict]:
        frames: list[dict] = []
        async for frame in aiter:
            assert frame.startswith("data: ") and frame.endswith("\n\n")
            frames.append(json.loads(frame[6:].strip()))
        return frames

    return asyncio.run(run())


def test_word_chunks_roundtrip():
    text = "Led a cross-border GTM strategy with measurable revenue."
    assert "".join(text_stream.word_chunks(text)) == text


def test_live_streams_tokens_then_done():
    seen: list[str] = []

    async def finalize(text: str) -> dict:
        seen.append(text)
        return {"new_coin_balance": 42}

    frames = _drain(
        text_stream.live(_FakeProvider(tokens=["Strong ", "match."]), [], max_tokens=50, finalize=finalize)
    )
    tokens = "".join(f["text"] for f in frames if f["type"] == "token")
    done = [f for f in frames if f["type"] == "done"]
    assert tokens == "Strong match."
    assert seen == ["Strong match."]            # finalize gets the full, stripped text
    assert done and done[0]["new_coin_balance"] == 42


def test_live_empty_stream_errors_and_skips_finalize():
    called = False

    async def finalize(text: str) -> dict:
        nonlocal called
        called = True
        return {}

    frames = _drain(text_stream.live(_FakeProvider(tokens=[]), [], max_tokens=50, finalize=finalize))
    assert not called                            # never charge a stream with no text
    errs = [f for f in frames if f["type"] == "error"]
    assert errs and errs[0]["recoverable"] is True
    assert not any(f["type"] == "done" for f in frames)


def test_live_provider_failure_errors_and_skips_finalize():
    called = False

    async def finalize(text: str) -> dict:
        nonlocal called
        called = True
        return {}

    frames = _drain(text_stream.live(_FakeProvider(fail=True), [], max_tokens=50, finalize=finalize))
    assert not called
    errs = [f for f in frames if f["type"] == "error"]
    assert errs and errs[0]["recoverable"] is True


def test_live_finalize_abort_emits_error_not_done():
    async def finalize(text: str) -> dict:
        raise text_stream.StreamAbort("Out of tokens.", recoverable=False)

    frames = _drain(text_stream.live(_FakeProvider(), [], max_tokens=50, finalize=finalize))
    errs = [f for f in frames if f["type"] == "error"]
    assert errs and errs[0]["recoverable"] is False and errs[0]["message"] == "Out of tokens."
    assert not any(f["type"] == "done" for f in frames)


def test_replay_retypes_text_then_done_payload():
    frames = _drain(text_stream.replay("Already paid.", done={"new_coin_balance": 9, "cached": True}))
    tokens = "".join(f["text"] for f in frames if f["type"] == "token")
    done = [f for f in frames if f["type"] == "done"]
    assert tokens == "Already paid."
    assert done and done[0]["cached"] is True and done[0]["new_coin_balance"] == 9


def test_one_emits_single_frame_verbatim():
    frames = _drain(text_stream.one({"type": "done", "mode": "question", "question": "What number?"}))
    assert frames == [{"type": "done", "mode": "question", "question": "What number?"}]
