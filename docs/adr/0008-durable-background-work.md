# ADR-0008 — Durable Background-Work architecture (Background Jobs · Work Lanes · Job Runner · Provider Budget)

- **Status**: Accepted
- **Date**: 2026-05-29
- **Supersedes**: `asyncio.create_task` fire-and-forget in `cv_workflow.py` (CV upload phase-2 + initial match-compute) and the FastAPI `BackgroundTasks` dispatch in `routers/cv/skill_edit.py`
- **Related**: ADR-0004 (LLM actions cost XP; 2-phase upload, refund-on-fail) · ADR-0002 (scoring façade) · CVUP1–4 (upload idempotency/resume/sweep/scanned-guard) · METRIC1 (refund-rate alert) · `project_cv_loading_redesign` (worker writes `current_phase` for the honest loading UI)

## Context

The CV-upload → LLM-parse → score → match pipeline is the load-bearing entry to the entire product (every value loop starts at upload). Under 10,000-user load it had three structural failure modes:

1. **In-process fire-and-forget.** `cv_workflow.py` ran phase-2 as `asyncio.create_task(_run_cv_upload_job)` and `asyncio.create_task(_trigger_initial_match_compute)` inside the single Railway web process. No durability (lost on restart — patched crudely by the CVUP3 orphan-sweep), no backpressure, no concurrency cap. A deploy or crash mid-parse stranded users.
2. **No rate-limit resilience.** `LLMProvider.complete` caught 429 the same as any exception and walked to the next provider; under load all tiers exhaust → `LLMProviderError` → refund storm (graphify nodes: *"score processing exceeds 20-30s → rate limit"*, *"refresh triggered rate limit"*). No retry/backoff, no concurrency cap.
3. **Three dispatch mechanisms.** RQ durable queue (Job Refresh only), `asyncio.create_task` (CV upload + match), FastAPI `BackgroundTasks` (skill-edit). The most critical onboarding action used the least durable one.

A durable seam **already existed** — `redis` + `rq` deps, `app/workers/jobs_compute_worker.py`, `job_refresh/_redis_state.enqueue_pipeline`, `_is_async_mode()` toggle — but was shaped only for Job Refresh. CV upload bypassed it.

Product priority (Shivam): **speed, success, no outages — success is never sacrificed for speed. Once a user uploads a CV, they get their output.**

## Decision

**Generalize the existing RQ durable seam so every LLM-bearing background job rides it.** Retire `asyncio.create_task` and `BackgroundTasks` for this work. Introduce the domain vocabulary (see CONTEXT.md): **Background Job · Work Lane · Job Runner · Provider Budget · Overload Policy · Upload Guarantee.**

1. **Background Job** — durable unit of deferred work (CV parse+score, initial match-compute, paid Job Refresh, skill-edit re-tag). Enqueued only after its durable intent row exists (`cv_upload_jobs.id` = correlation key). Idempotent on that key — re-run never double-charges (ledger guards), double-writes a baseline, or double-refunds.

2. **Two Work Lanes** —
   - `fast` — a user is staring at a loading screen: CV upload parse+score, paid Job Refresh.
   - `bulk` — nobody is waiting: initial match-compute, skill-edit re-tag.
   A flood of bulk work can never delay a waiting user.

3. **Job Runner** — worker process(es) separate from the web process, listening `[fast, bulk]` (RQ pops fast first). Run **2** for redundancy. Low per-Runner concurrency; the true ceiling is the Provider Budget.

4. **Retry policy** — 3 retries with growing backoff (~5s / 15s / 45s) on **TRANSIENT** failure only (provider-unavailable, 429, timeout, network). **PERMANENT** failures (no skills, scanned/short PDF, taxonomy-unmapped) fail fast + refund immediately with no retry (kills the `thui46348` scanned-PDF loop).

5. **Provider Budget** — a single global ceiling on concurrent LLM calls, shared across all Runners and web requests (Redis token bucket), enforced behind `LLMProvider.complete`. Scaling Runners for reliability never raises 429 risk. Paired with rate-limit-aware retry inside `complete` (classify 429/5xx/timeout vs hard-fail; honour `Retry-After`).

6. **Overload Policy** — uploads are **never rejected for load**. The durable rail absorbs the spike; the loading screen surfaces honest backpressure ("high demand — still working, you're in line"). Charge at enqueue; refund only on terminal failure after retries.

7. **Safety nets** — DROP the `_is_async_mode` dev inline-fallback (single prod path; devs run Redis). KEEP the CVUP3 orphan-sweep as an independent "night-watchman" backstop (catches anything the rail drops despite per-job timeout — Redis eviction, stuck registry, misconfig). Per-job timeout configured so a SIGKILLed worker's job auto-fails → refunds.

**Upload Guarantee (the invariant this serves):** durable rail (no loss on restart) + transient-retry (self-heal) + never-reject overload + orphan-sweep watchman ⇒ a silently-dropped upload is structurally impossible. The only terminal non-success is a PERMANENT failure, which fails fast, refunds, and tells the user how to fix it.

## Consequences

- **Positive:** survives restarts/deploys; bounded provider load (no 429 storms / refund storms); one durable dispatch mechanism instead of three; redundancy via Runner count without raising provider pressure; honest backpressure instead of busy-failures; the worker can write `cv_upload_jobs.current_phase` progressively, powering the honest CV-loading UI (`project_cv_loading_redesign`).
- **Negative / cost:** a Redis instance + a Worker service (2 replicas) on Railway = new infra + ~$ cost; devs must run Redis locally; multi-lane multi-job-type worker is more code than a `create_task`.
- **Idempotency burden:** every Background Job body must be safe to re-run (RQ at-least-once). CV parse job must guard double baseline-write + `mark_done`. Charge/refund already idempotent via the XP ledger (ADR-0004 / XP-DB2/3).

## Alternatives rejected

- **Keep `asyncio.create_task`, add a semaphore.** Caps concurrency but stays in-process — no durability; a restart still strands users. Fails the Upload Guarantee.
- **One lane with priority flag.** Simpler than two lanes but bulk can starve under sustained load and a waiting user can queue behind background prep.
- **Per-Runner concurrency cap (no shared budget).** Total provider load = Runners × cap, so scaling Runners for reliability raises 429 risk — backwards.
- **Hard load-shedding (reject uploads past depth N).** Protects the system but IS an upload failure — violates the Upload Guarantee.
- **Retire the orphan-sweep (trust RQ timeout alone).** Removes a near-free independent backstop; per-job timeout doesn't cover Redis eviction / misconfig. Inconsistent with "never fail an upload."
