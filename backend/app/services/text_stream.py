"""text_stream — the one seam for live generative text over SSE (ADR-0009).

Every surface that types an LLM answer at the user (why-you-fit, deepeners,
per-bullet Mentor rewrite, …) speaks the SAME token/done/error envelope, obeys
the SAME provider rule ("never swap provider mid-stream"), guards the SAME empty
stream, and charges only on `done`. That contract used to be hand-inlined in
each router (`analyse` + `deepen` had byte-identical copies). It lives here now.

Two ways in:

    live(provider, messages, max_tokens=…, finalize=…)
        Stream a fresh answer token-by-token. `finalize(full_text)` runs once,
        after a complete stream, and returns the `done` payload (this is where a
        caller charges + persists). It may raise `StreamAbort` to end on `error`
        instead (e.g. insufficient balance) — nothing was charged.

    replay(text, done=…)
        Re-emit already-paid text as a live-feeling typewriter (cached idempotent
        path). Never calls a provider, never charges.

Both yield ready-to-write SSE frames; hand the iterator to `response()`.

Provider-fallback semantics (ADR-0009): the A→B→C ladder inside
`LLMProvider.stream_complete` runs pre-first-token only. Once a token is yielded
the provider is committed; a mid-stream death surfaces as `error{recoverable}`,
never a silent swap.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi.responses import StreamingResponse

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

# Typewriter cadence for replayed (cached) text. Live text paces itself by the
# provider's own token arrival; the client smooths both.
_REPLAY_DELAY_S = 0.012

# Terminal copy for the two infrastructure failures every surface shares. Surface
# specific copy stays in the caller's `finalize` (raise StreamAbort).
_INTERRUPTED = "Interrupted — retry."
_EMPTY = "Nothing produced — retry."


class StreamAbort(Exception):
    """Raised from a `finalize` callback to end the stream on `error` rather than
    `done`. Carries the user-facing message + whether a retry is offered. Nothing
    has been charged when this fires (finalize owns the charge)."""

    def __init__(self, message: str, *, recoverable: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.recoverable = recoverable


def sse(payload: dict) -> str:
    """One ADR-0009 envelope as a single SSE frame."""
    return f"data: {json.dumps(payload)}\n\n"


def word_chunks(text: str) -> list[str]:
    """Re-chunk a finished string into word-ish pieces so a cached replay still
    feels live. Join of the pieces is exactly the input (no chars added/dropped);
    the client typewriter smooths the rest."""
    out: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch == " " and len(buf) >= 4:
            out.append(buf)
            buf = ""
    if buf:
        out.append(buf)
    return out


async def live(
    provider: LLMProvider,
    messages: list[dict],
    *,
    max_tokens: int,
    finalize: Callable[[str], Awaitable[dict]],
) -> AsyncIterator[str]:
    """Stream a fresh LLM answer, then run `finalize(full_text)` for the `done`
    payload. Emits `token`* → (`done` | `error`). A provider failure or an empty
    stream ends on `error{recoverable:true}` and `finalize` never runs — so a
    caller that charges inside `finalize` never charges a failed stream."""
    parts: list[str] = []
    try:
        async for delta in provider.stream_complete(messages, max_tokens=max_tokens):
            parts.append(delta)
            yield sse({"type": "token", "text": delta})
    except LLMProviderError:
        yield sse({"type": "error", "recoverable": True, "message": _INTERRUPTED})
        return

    text = "".join(parts).strip()
    if not text:
        yield sse({"type": "error", "recoverable": True, "message": _EMPTY})
        return

    try:
        done = await finalize(text)
    except StreamAbort as abort:
        yield sse({"type": "error", "recoverable": abort.recoverable, "message": abort.message})
        return

    yield sse({"type": "done", **done})


async def replay(text: str, *, done: dict) -> AsyncIterator[str]:
    """Re-emit `text` as a typewriter, then a terminal `done` frame carrying
    `done` (e.g. `{"new_coin_balance": …, "cached": True}`). No provider, no
    charge — the idempotent already-paid path."""
    for chunk in word_chunks(text):
        yield sse({"type": "token", "text": chunk})
        await asyncio.sleep(_REPLAY_DELAY_S)
    yield sse({"type": "done", **done})


async def one(payload: dict) -> AsyncIterator[str]:
    """Single-frame stream — for a terminal result that has no tokens to type
    (e.g. the no-fabrication guard returns a `question`, or a pre-stream error)."""
    yield sse(payload)


def response(frames: AsyncIterator[str]) -> StreamingResponse:
    """Wrap a frame iterator as an SSE HTTP response. `X-Accel-Buffering: no`
    defeats proxy/load-balancer buffering — without it an intermediary can buffer
    the whole stream and deliver it at once, which looks exactly like a blocking
    load even though the server streamed."""
    return StreamingResponse(
        frames,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
