# Issue set — Durable Background-Work (ADR-0008)

Tracer-bullet vertical slices. Each is independently grabbable + shippable. Order = thin end-to-end first (1, 3 are the tracer bullets), then widen. File via `gh issue create` once gh is installed, or paste into GitHub.

Repo: shivam07-hub/True_Yodha · Branch: all work on `Develop`.

---

## #1 — Infra tracer: Redis + Worker service + one job round-trips in prod
**Why:** prove the durable rail works end-to-end before porting anything real.
**Scope:**
- Provision Redis on Railway; set `REDIS_URL` in backend env.
- Add a Worker service (start `python -m app.workers.jobs_compute_worker`), 2 replicas.
- Generalize the worker to listen on lanes `[fast, bulk]` (RQ `Worker([fast, bulk])`).
- A throwaway noop `fast` job to prove enqueue → consume → done in prod.
**Acceptance:** enqueue a noop fast job from a one-off script; worker logs consumption; job state observable in Redis. Web process restart does not lose it.
**Files:** `app/workers/jobs_compute_worker.py`, `job_refresh/_redis_state.py`, Railway config.

## #2 — Generalize the dispatch seam (lane + job_type) and port Job Refresh onto it
**Why:** one durable dispatch mechanism; refresh proves the generalized form before CV upload depends on it.
**Scope:**
- `enqueue(lane, job_type, payload)` + a dispatch table mapping `job_type → handler` in the worker.
- RQ `Retry(max=3, interval=[5,15,45])` + per-job `timeout` baked into enqueue.
- Refactor `job_refresh._dispatch` / `_redis_state` to use the generalized `enqueue` (refresh = `fast` lane, job_type `job_refresh`).
**Acceptance:** Job Refresh still works end-to-end through the generalized seam; retry + timeout configured; existing refresh tests green.
**Files:** `job_refresh/_dispatch.py`, `job_refresh/_redis_state.py`, new `services/background/` seam module.

## #3 — TRACER: Port CV upload phase-2 onto the fast lane (the money slice)
**Why:** the load-bearing entry point; the whole ADR exists for this.
**Scope:**
- Replace `cv_workflow.py:321` `asyncio.create_task(_run_cv_upload_job)` with `enqueue("fast", "cv_parse_score", {job_id,...})`.
- Replace `:392` initial match-compute with `enqueue("bulk", "initial_match", {user_id})`.
- Worker handler = current `_run_cv_upload_job` body, made **idempotent on `cv_upload_jobs.id`**: guard double baseline-write + double `mark_done`.
**Acceptance:** upload → score works via the rail. Kill the web process mid-parse → job survives + completes on a worker. No double baseline row on RQ retry.
**Files:** `cv_workflow.py`, worker handler module.

## #4 — Transient-vs-permanent failure classification + fail-fast
**Why:** retrying a scanned PDF 3× is cruel + wastes provider budget (the `thui46348` loop).
**Scope:**
- Classify failures: TRANSIENT (provider-unavailable/429/timeout/network) → RQ retry; PERMANENT (no_skills/scanned-short/taxonomy_unmapped) → raise a no-retry terminal that refunds immediately.
- Wire into the `_fail_and_refund` paths.
**Acceptance:** scanned PDF fails + refunds in <5s with no retry; a simulated 429 retries with backoff then succeeds.
**Files:** worker handler, `cv_workflow._fail_and_refund`, `cv_parser`.

## #5 — Provider Budget: global LLM concurrency ceiling + rate-limit-aware retry
**Why:** bound provider load so 10k uploads never trip 429; scaling Runners stays safe.
**Scope:**
- Redis token-bucket global semaphore behind `LLMProvider.complete` — take token before call, return after.
- Inside `complete`: classify 429/5xx/timeout vs hard-fail; retry+backoff honouring `Retry-After` within a tier before falling through.
- Single env knob for the ceiling (tune from measured p90).
**Acceptance:** N concurrent calls never exceed M in-flight (test with fake client); 429 backs off rather than instantly walking the chain.
**Files:** `llm_provider.py`, `services/background/provider_budget.py`.

## #6 — Overload Policy: honest backpressure UX (never reject)
**Why:** Upload Guarantee — uploads are never rejected for load.
**Scope:**
- Surface queue depth / position from the rail into `get_cv_upload_status`.
- Loading screen shows "high demand — still working, you're in line" past a depth/time threshold (feeds `project_cv_loading_redesign` >90s honest copy). No charge-then-reject.
**Acceptance:** deep queue → status reflects queued/position; charge happens at enqueue; nothing is rejected.
**Files:** `cv_workflow.get_cv_upload_status`, `schemas/cv.py`, frontend `<CvScoreProgress>`.

## #7 — Port skill-edit re-tag onto the bulk lane
**Why:** retire the third dispatch mechanism (FastAPI `BackgroundTasks`).
**Scope:** replace `routers/cv/skill_edit.py` `background_tasks.add_task(...)` with `enqueue("bulk", "skill_retag", {...})`.
**Acceptance:** skill-edit async re-tag runs via the rail; `recompute_finished_at` poll (SE17) still resolves.
**Files:** `routers/cv/skill_edit.py`, worker handler.

## #8 — Drop dev inline fallback; verify orphan-sweep watchman on the rail
**Why:** single prod path; keep the independent backstop for the Upload Guarantee.
**Scope:**
- Remove `_is_async_mode` inline branch (require `REDIS_URL`; dev runs Redis).
- Confirm CVUP3 orphan-sweep still runs on startup + reaps/refunds stranded rail jobs.
**Acceptance:** manually strand a job (kill worker mid-flight) → sweep refunds it on next startup; dev without Redis fails loudly, not silently inline.
**Files:** `job_refresh/_dispatch.py`, `cv_workflow`, `main.py` sweep.

## #9 — Tests + observability
**Scope:** enqueue contract; idempotent re-run; transient-retry vs permanent-fail-fast; provider-budget cap; overload-never-rejects. Wire METRIC1 refund-rate + a queue-depth gauge.
**Acceptance:** suite green; refund-rate + queue-depth observable in logs/metrics.
**Files:** `backend/tests/`, metric emit points.

---
**Tracer path:** #1 → #3 give a working durable CV-upload end-to-end. #2 unblocks both. #4–#9 widen coverage + resilience. Each closes independently on `Develop`.
