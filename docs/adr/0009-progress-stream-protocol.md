# ADR-0009 — Progress-Stream Protocol (live token / phase / progress feed over SSE)

- **Status**: Accepted (PR1 direct token stream + PR2 SSE relay both shipped 2026-05-30)
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
- **PR2 — SSE relay (SHIPPED 2026-05-30).** Match-refresh + skill-edit **dropped frontend polling** for one long-lived SSE stream each. Resolution diverged from the original pub/sub fan-out: the relay is **snapshot-watch**, not Redis pub/sub. See below.

### PR2 resolution — snapshot-watch over pub/sub

The original Decision pictured workers *publishing* to a Redis channel that the web relay *subscribes* to. Implementation chose a simpler, equally-correct shape: the source of truth for both surfaces is **already cross-process** — Job Refresh state lives in a Redis key (`set_state`/`get_state`, written by the RQ worker), skill-edit completion is the `cv_versions.recompute_finished_at` Postgres flag. So the web relay just **tails the existing snapshot** on a short server-side tick (`TICK_SECONDS=0.7`, hard `TIMEOUT_SECONDS=45`) and emits the typed envelope:

- `GET /jobs/refresh/{ticket_id}/stream` — `phase` (queued/computing, on label change) → `done` (matches_written, outcome_kind, refund, new_xp_balance) / `error` (failed | timeout).
- `GET /cv/skill-edit/recompute-status/{baseline_id}/stream` — `phase` (scoring) → `done` (recompute_finished_at | timeout) / `error` (missing baseline).

Why snapshot-watch won:
- **Dev/prod parity** — works with REDIS_URL set (worker writes Redis key) AND unset (in-process state / DB flag) with the same code. Pub/sub would only fire on the durable path.
- **Zero worker changes** — no publish calls threaded through the RQ handlers; the relay is purely additive on the web process.
- **Free reconnect** — a fresh connection re-reads the snapshot; no per-job replay buffer needed (the open question below).
- **Frontend polling dropped** — the browser holds one `text/event-stream` connection (`lib/streaming/read-sse.ts`) instead of N short polls; `useJobRefresh` + `skill-card-inline` map events to their existing state machines. Legacy poll endpoints kept for the deploy window + manual fallback.

Cost: latency-to-signal is the server tick (~0.7s), not pub/sub-instant. Acceptable — these are second-scale waits and the relay read (Redis GET / single-row Postgres) is cheap on one web process. Redis pub/sub stays available as a future latency optimization if a surface needs sub-second push.

Analyse (PR1) stays on its direct token stream — no relay migration needed; it shares the `read-sse` envelope shape.

## Consequences

- One client primitive (`useProgressStream`) renders three structurally different waits.
- Polling retired on two surfaces (match-refresh ticket-poll, skill-edit 3s-poll) → fewer requests, lower latency-to-first-signal.
- New infra: Redis pub/sub channels (lifecycle tied to job/ticket id, auto-expire), an SSE relay endpoint (long-lived connection budget on the web process — cap + heartbeat needed), reconnection/resume semantics (client may drop and re-subscribe mid-job).
- Streaming holds a Provider Budget slot longer than a blocking call (~full stream vs single shot). Acceptable for analyse (XP-gated, low frequency); revisit if it pressures the bucket under load.

## Open questions

Resolved in PR2:
- **Heartbeat** — `: keepalive` comment frame emitted on every no-change tick (`progress_stream.HEARTBEAT`) + `X-Accel-Buffering: no` to defeat proxy buffering.
- **Reconnect/resume** — snapshot-watch makes this trivial: a reconnect re-reads the current snapshot, so no replay buffer is needed. The hard `TIMEOUT_SECONDS` guarantees the connection settles.
- **Connection ceiling** — one SSE per active wait (refresh / skill-edit), short-lived (terminal-or-timeout ≤45s). Not a standing-connection load. Revisit only if a future always-on stream lands.

Still open:
- **Match-refresh "which job streams" UX** — today it's an aggregate progress label; per-job sequential reveal is a future enhancement (would need the pipeline to emit per-job `progress` events).
- **Gemini `stream=true`** (PR1 analyse) — verify the OpenAI-compat leg honours streaming in prod; the relay surfaces are unaffected (no LLM token stream).
- **Redis pub/sub latency path** — layer publish-on-write + subscribe-wakeup if any surface needs sub-tick latency.
