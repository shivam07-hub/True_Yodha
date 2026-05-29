# ADR-0009 — Progress-Stream Protocol (live token / phase / progress feed over SSE)

- **Status**: Proposed (PR1 ships the direct-stream slice; full protocol deferred to PR2)
- **Date**: 2026-05-30
- **Related**: ADR-0008 (durable background work — Work Lanes, Job Runner, Redis) · ADR-0004 (LLM actions cost XP; charge-on-success, refund-on-fail) · `project_cv_loading_redesign` (real phases, no lying clock) · SE17 (skill-edit recompute 3s poll) · `analyse_job` endpoint (`routers/jobs/analyse.py`)

## Context

Three user-facing waits run LLM-bearing work and give the user **no visible progress** while it runs:

| Surface | Today | Runs where | Streamable signal |
|---|---|---|---|
| Focused-job "Why this is a good fit" | blocking `complete()`, static placeholder | web request (sync) | **token** stream (live reasoning text) |
| Match-refresh | `202` + ticket → poll `GET /jobs/refresh/status` | RQ worker (ADR-0008, separate process) | **event** stream (per-job "ranked X" + phase) |
| Skill-edit recompute | poll `recompute-status` every 3s (SE17) | background | **phase** stream (re-tagging → scoring → done) |

Trigger: Shivam asked why the LLM call shows no "working/thinking" like Claude does — the user stares at a dead placeholder while the backend computes. Claude's engagement = real token **streaming** (SSE). The product wants the same: keep the user engaged *by the time the LLM fetches the answer*.

Naïve "stream tokens everywhere" does not fit. Two of the three surfaces are **durable jobs on separate worker processes** (ADR-0008) — a worker cannot hold the browser's SSE connection. And skill-edit has no text to stream at all; its signal is phase transitions.

## Decision

**One typed progress-stream protocol.** A worker (or sync request) publishes typed events to a Redis pub/sub channel keyed by job/ticket id. An SSE relay endpoint on the web process subscribes to that channel and relays events to the client. The sync analyse path uses the same envelope. Each surface emits only the event types that fit it.

```
worker / sync handler ──publish──▶ redis channel(job_id)
                                        │
        web SSE relay  ◀──subscribe─────┘
                │
                ▼  text/event-stream
             browser  ── useProgressStream() renders by type
```

**Event envelope** (`type` discriminates):

| type | payload | emitted by |
|---|---|---|
| `token` | `{ text }` | analyse (live reasoning) |
| `phase` | `{ phase, label }` | skill-edit (`re-tagging`→`scoring`→`done`), match-refresh phase markers |
| `progress` | `{ done, total, label }` | match-refresh (per-job ranked counter) |
| `done` | `{ result? }` | all — terminal success; client stops, charge already landed server-side |
| `error` | `{ recoverable, message }` | all — terminal failure; client shows retry |

**Charge semantics inherit ADR-0004:** charge on `done` (success), never on `error`. Backend accumulates server-side so a client disconnect after `done` still persists + charges.

**Provider fallback under streaming (token type):** the `LLMProvider.complete` fallback ladder (A→B→C) runs **pre-first-token only** — once a `token` event is emitted the provider is committed. A mid-stream provider death emits `error{recoverable:true}` (partial text kept, greyed, retry offered), never a silent mid-sentence provider swap. New `LLMProvider.stream_complete()` yields tokens, holds the ADR-0008 Provider Budget slot for the full stream.

**Transport:** `fetch` + `ReadableStream` reader against a FastAPI `StreamingResponse` (POST, bearer header, `text/event-stream`). `EventSource` is rejected — GET-only, cannot send the bearer auth header.

## Rollout (sequenced)

- **PR1 — analyse streams, direct (no Redis).** Synchronous `StreamingResponse` straight from the analyse request handler. Emits `token` + `done`/`error`. Ships the engagement win immediately. Client `useStreamingText()` reader util + typewriter smoothing (~40–60 cps queue drain) for the Claude feel. The reader util is written against the full envelope so PR2 reuses it unchanged.
- **PR2 — protocol + relay.** Redis pub/sub publish helper + SSE relay endpoint on the web process. Workers publish `phase`/`progress`. Match-refresh + skill-edit **drop polling** and adopt the stream. Analyse migrates from direct-stream to the relay so all three share one rail (consistent with the durable move — analyse may itself become a Background Job later).

## Consequences

- One client primitive (`useProgressStream`) renders three structurally different waits.
- Polling retired on two surfaces (match-refresh ticket-poll, skill-edit 3s-poll) → fewer requests, lower latency-to-first-signal.
- New infra: Redis pub/sub channels (lifecycle tied to job/ticket id, auto-expire), an SSE relay endpoint (long-lived connection budget on the web process — cap + heartbeat needed), reconnection/resume semantics (client may drop and re-subscribe mid-job).
- Streaming holds a Provider Budget slot longer than a blocking call (~full stream vs single shot). Acceptable for analyse (XP-gated, low frequency); revisit if it pressures the bucket under load.

## Open questions (resolve in PR2 design)

- SSE relay connection ceiling + heartbeat/keepalive interval on the web process.
- Reconnect/resume: client drops mid-stream — replay from a buffered tail, or restart? (Redis pub/sub is fire-and-forget; may need a short per-job event buffer in Redis for replay.)
- Match-refresh "which job streams" UX — sequential per-job reveal vs aggregate progress counter.
- Verify Gemini (OpenAI-compat base URL) honours `stream=true`; define non-streaming fallback if any provider rejects it.
