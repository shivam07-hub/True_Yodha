# Myro Search — pre-flight rebuild

**Status:** locked, not started · **Decided:** 2026-08-18, Shivam + architecture
**Scope:** the Myro Search pre-flight modal and the Match Run it dispatches.
**Read first:** [CLAUDE.md](CLAUDE.md) · [CONTEXT.md](CONTEXT.md) §Pre-flight Order, §Job Refresh, §Match Run

This file is the build contract. Every decision below was settled in a grill and
is **not open for re-litigation**. If you believe one is wrong, say so before you
write code — do not quietly build a different thing.

---

## THE ONE IDEA

> **The Order is not a list the user maintains. It is a conversational way to
> fill a six-slot search spec the backend already has.**

Everything else follows. The 47 lines a user accumulates exist to make filling
six slots feel like talking instead of filling a form. They are **input
material**, not the payload.

`payload.project()` is where the Order becomes the spec. Today it is six calls to
`_texts()` and a magic `[:6]`. It must become a **resolver**: Order → spec, plus
a conflict report.

The six slots, and what each actually accepts today:

| Slot | Fed by line kind | Arity today |
|---|---|---|
| `target_role_titles` | `role` | up to 6 |
| `target_location` | `location` | **first only** |
| `deal_breakers` | `wont_take` + `pay_floor` | up to 6 |
| `lean` | `lean` | up to 6 |
| `career_goal` | `goal` | **first only** |
| `superpower` | `strength` | **first only** |

Three slots silently keep `[0]` and discard the rest. A user who answered *yes*
to three goals had two thrown away with no trace. That is a defect, not a design.

---

## WHY THIS IS STAGE ONE

Users cannot get value from a search that loses their work. Today a user spends
three screens teaching Myro what they want, presses Run, and — for 38% of them —
watches it die on a raw Python exception. Then the modal resets to "Name the
work" and asks them to do all of it again.

The Delta-4 gain is not a faster search. It is: **the work you did is still
there, and one tap runs it again.**

---

## MEASURED FACTS (do not re-derive)

Measured 2026-08-18 against production.

- `.in_()` serialises **~19 bytes per job_id** into the URL query string.
- httpx `MAX_URL_LENGTH` is **65,536** → `.in_()` throws at **~3,440 ids**.
  The throw is `httpx.InvalidURL("URL component 'query' too long")`.
- Candidate pool per user (332 users with skills): p50 **2,644**, p90 **6,048**,
  max **9,611**.
- **127 of 332 users (38%) exceed the URL limit** — their Match Run can never
  succeed. It is not intermittent.
- Between ~1,000 and ~3,440 ids the query does not throw. It **silently
  truncates** at PostgREST's row cap, so eligibility keeps ≤1000 candidates.
  p50 is 2,644 — most users who do not crash are searching a fraction instead.
- Pool filtering costs `2 × ceil(N/200)` sequential round trips. At p90 that is
  **62 round trips** before the brain starts.

---

## INVARIANTS — breaking one of these is a defect, not a trade-off

1. **Unanswered lines are dropped server-side at run.** `lines.drop_unanswered`
   runs in `POST /preflight/run` before the payload is projected. A client that
   forgets must not be able to widen the search. Never move this to the client.
2. **`job_is_eligible` has exactly ONE derivation, and it is Python.**
   Do **not** reimplement career-band or seniority logic in SQL. A second
   derivation produces two users' worth of verdicts for one user, and verdicts
   are cached permanently per `(user, job)`.
3. **Any id list that scales with data goes in a request body, never a URL.**
   `.in_()` is only safe on bounded lists. The house pattern is a body-encoded
   RPC — see `fetch_job_skills_by_job_ids_v2`.
4. **A throw is not a record.** Never surface `str(exc)` to a user. Classify at
   the seam, emit a metric, log the exception, show a named message.
5. **Role titles are the one write vocabulary.** `target_roles` is derived from
   them and must never be emptied as a side effect. An empty scoping key tells
   users the market has nothing.
6. **The contract line must be true.** If Myro runs on 26 of 39 lines, it says
   26. Never print a number the resolver did not actually use.
7. **Never charge twice.** A retry happens inside the existing ticket. The
   server dedupe window is 90s; the client guard does not survive two tabs.

---

## LOCKED DECISIONS

| # | Decision |
|---|---|
| 1 | **Standing order resumes.** Modal opens on review with *Run again*. Fresh start only when the user declares change by saying something new. |
| 2 | **Drift rides alongside the run.** New guesses since last search sit above the Run button, answerable in place. Run stays one tap and always works. Unanswered ones are dropped at run, as today. |
| 3 | **One visible retry** on a failed Match Run, inside the same ticket, no second charge. Only a second failure surfaces an error, and it is named — never the exception. |
| 4 | **The wait screen is about the job Myro is reading right now.** Shuffle-pinned hero, same motion dialect as the confirm rounds. Count small underneath. Contract line pinned. Queued state says what it is genuinely waiting for. |
| 5 | **Merge, dedupe, trim.** The Order is not append-forever. The user gets a trim control; nothing is retired without them saying so. |
| 6 | **The Order fills a six-slot spec.** `project()` becomes a resolver emitting a conflict report. |
| 7 | **Duplicates collapse silently. Contradictions become one either/or on review, before the run.** Slot arity is stated honestly — no more silent `[0]`. |

Deferred by decision, **do not build**: the scrape-triggered bell that nudges a
user whose order has drifted. Ships after we measure real drift volume for a
week. A weekly nudge firing on noise trains people to ignore the bell.

---

## SLICES

Build in this order. Each slice is one commit, green on all five gates before
the next starts. Commit to `Develop` — standing approval, no need to ask.

### S0 · Commit the working-tree dedupe work

Already written, already green. Lands first because S2 builds on it.

**Files:** `backend/app/services/preflight/memory_import.py`,
`backend/app/services/preflight/lines.py`,
`backend/tests/test_preflight_order.py`,
`frontend/lib/preflight/round-lines.ts`,
`frontend/tests/preflight-round-lines.test.ts`,
`frontend/components/preflight/shuffle-guess-list.{tsx,css}`,
`frontend/components/preflight/screen-confirm.tsx`

Fixes the same statement arriving twice from the distiller (`work_mode` and
`preference` both "Prefers onsite work") producing two line ids in two rounds.
Import dedupe: one normalized statement → one line, `wont_take` beats `lean`.

**Done when:** five gates green. `git add` only these files — never `-A`.

---

### S1 · The outage — candidate pool in one call

**Problem:** [`jobs.py:2831 get_jobs_by_ids`](backend/app/repositories/jobs.py:2831)
does `.in_("job_id", job_ids)` with no chunking and no pagination. Called by
`filter_job_ids_for_eligibility` on every Match Run, fed the whole pool.
Throws for 38% of users, silently truncates for most of the rest.

**Solution:** one read-only RPC replacing `get_candidate_job_ids_for_skills` +
`_filter_job_ids_by_location` + `_filter_job_ids_by_recommendability` +
`get_jobs_by_ids`. Ids travel in the body. 62 round trips → 1.

**The RPC returns eligibility columns; it does not decide eligibility.**
Invariant 2. `job_is_eligible` still runs in Python over the returned rows.

Sketch — verify against live schema and `EXPLAIN` before applying:

```sql
create or replace function public.candidate_jobs_for_user(
  p_skill_keys text[],
  p_countries  text[] default null,   -- pass LOWERCASE from Python
  p_require_fresh boolean default true
)
returns table (
  job_id text, role_domain text, career_band text, seniority_level text,
  min_years_experience integer, max_years_experience integer
)
language sql stable
set search_path to 'public'
as $$
  select distinct j.job_id, j.role_domain, j.career_band, j.seniority_level,
         j.min_years_experience, j.max_years_experience
  from public.jobs j
  where (not p_require_fresh
         or (j.is_active and j.listing_confidence = 'active'))
    and exists (
      select 1
      from public.job_skills js
      join public.skills s on s.id = js.skill_id
      where js.job_id = j.job_id
        and s.taxonomy_key = any(p_skill_keys)
    )
    and (
      p_countries is null or cardinality(p_countries) = 0
      or lower(j.location_country) = any(p_countries)
      or (j.location_country is null
          and lower(j.location_mode) in ('remote','hybrid'))
    );
$$;
```

**Semantics that must not drift.** The location rule is *country in target set*
**OR** *(country is null AND mode is remote/hybrid)* — copy it exactly from
`_filter_job_ids_by_location`. The freshness rule is `is_active AND
listing_confidence = 'active'` — from `_filter_job_ids_by_recommendability`.
`last_seen` age is deliberately ignored; that is verifier-owned, not scraper-owned.

**Verify before claiming done:**
- `EXPLAIN ANALYZE` at p90 pool size (~6,000 rows). Check `Heap Fetches`.
- Confirm the RPC response is not row-capped. If PostgREST `db-max-rows` is set,
  paginate the RPC result — a silent cap here is the exact bug being fixed.
- Prove the old path is gone: `get_jobs_by_ids` must have no remaining caller on
  the match path. Re-run the grep unfiltered before claiming zero consumers.
- **Delete on the way past.** `_filter_job_ids_by_location` and
  `_filter_job_ids_by_recommendability` become unreachable — remove them in this
  commit, not as a follow-up.

**Migration:** additive, read-only, reversible. Apply it yourself this session,
then `NOTIFY pgrst, 'reload schema';` and spot-check the function.

**Tests:** a repo test asserting a 5,000-id pool completes (the old path throws);
a test asserting location and freshness semantics match the deleted helpers.

**Done when:** a user with a 6,000-job pool completes a Match Run, and the
`route.slow` line for `/preflight/run` drops out of the p90.

---

### S2 · The resolver — Order → six-slot spec

**Files:** `backend/app/services/preflight/payload.py` (+ tests)

Replace `project()`'s six `_texts()` calls and `_MAX_PER_GROUP` with a resolver
that returns the spec **and** a conflict report:

- **Dedupe** — normalized-equal statements collapse to one. Silent; this is
  tidying, not a decision.
- **Per-slot arity, stated.** A slot that takes one value says so. If three
  goals are kept, that is a conflict, not a silent `[0]`.
- **Contradiction detection** — two kept lines that cannot both hold
  (`wont_take` against a `lean` saying the opposite; a location requirement
  against an openness to relocate). Report them; never resolve them.

The resolver is a pure module. **The interface is the test surface** — test it
directly with Order fixtures, not through the router.

**Do not** auto-resolve a contradiction. Guessing which one the user meant is
exactly the thing that loses trust.

---

### S3 · Resume + drift

**Files:** `frontend/components/preflight/preflight-gate.tsx`,
`frontend/components/preflight/screen-review.tsx`

The reset at [preflight-gate.tsx:85](frontend/components/preflight/preflight-gate.tsx:85)
sends every open back to "Name the work" and clears `said`. That is the
re-answer loop. `ScreenReview` renders purely from the server `order`, so
resuming to it costs **zero LLM calls**.

- A signed-off Order opens on review: *Run again* (primary), *Change something*
  (into rounds), *Start over* (quiet).
- Drift block above Run: "Since your last search", each new guess answerable in
  place with its source chip. Run stays enabled throughout.
- The contract line states what will actually run, including unanswered drift
  that will be dropped.

---

### S4 · Conflict UI on review

**Files:** `frontend/components/preflight/screen-review.tsx`

Consumes S2's report. One either/or card, both statements shown with their
sources and when they were said. User picks; run proceeds. Duplicates merged are
reported as a count, not a list — they were not a decision.

---

### S5 · Failure honesty

**Files:** `backend/app/services/job_refresh/_dispatch.py`,
`backend/app/services/job_refresh/types.py`,
`frontend/components/preflight/preflight-gate.tsx`,
`backend/app/routers/preflight.py`

1. **Typed outcome at the seam.** `_dispatch.py` line ~408 and `_run_inline`
   both do `error=str(exc)`. Replace with a classified failure kind. The raw
   exception goes to `logger.exception` and a metric line. Invariant 4.
2. **One visible retry** inside the same ticket, streamed so the user sees it.
   No re-charge — the ticket is already paid. A second failure surfaces the
   named message.
3. **`commitProposals` must not advance on failure.**
   [preflight-gate.tsx:200](frontend/components/preflight/preflight-gate.tsx:200)
   catches, sets an error, then calls `setScreen(...)` unconditionally — so a
   screen-2 failure is still on screen 4 next to "Run · Free". Stay on
   proposals, show the server's actual reason (the 409 "changed somewhere else"
   is currently swallowed), and invalidate the order on error like `answerLine`
   already does.
4. **Fix the live 422.** `ApplyRequest.effects` is capped `max_length=6`, but
   the client sends `accepted.flatMap(p => p.effects)` across *all* accepted
   proposals — trivially over 6. Seen in production 2026-08-18 09:24:37.
   Raise the cap to match what the screen can actually produce, or batch.

---

### S6 · The wait screen

**Files:** `frontend/components/preflight/screen-running.tsx`

The server streams **every** job as Myro rates it (`revealed`, with company and
title). Today the screen renders only the last one under a percentage — real
work arrives and is discarded.

Shuffle-pinned hero, same pattern and tokens as `shuffle-guess-list`. Each rated
job springs into the hero; the last few stack behind. Count small underneath.
Contract line pinned at the bottom. The `queued` state says what it is actually
waiting for — never a phase the Job Refresh did not enter (ADR-0009).

Myro tokens, not the reference library's palette. Respect `prefers-reduced-motion`.

---

### S7 · The `target_roles` wipe

**Files:** `backend/app/services/targeting_write.py:44`

`derive()` calls `onboarding_service.role_title_updates(titles)` with no
`role_family`/`role_families`, so `_normalize_families(None, None)` returns `[]`
and **every pre-flight run writes `target_roles: []`**. CONTEXT.md calls that
column the matcher and aspiration ILIKE keys. Invariant 5.

Preserve the stored families when the caller does not supply them. One-line fix,
its own commit, with a test that asserts a run does not empty the column.

---

## GATES

All five, every slice, before saying done:

```bash
pytest backend/tests && ruff check <your files>
```

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

```bash
cd frontend && npm run check:ui-drift && npm run build
```

`npm test` is the one that gets skipped. Do not skip it.

---

## OUT OF SCOPE

- The scrape-triggered drift bell (deferred, see Locked Decisions).
- Raising `_MAX_PER_GROUP` as a number. S2 dissolves it — arity becomes
  per-slot and honest, not one magic constant.
- Anything on `main`. Never merge to `main`; that is Shivam's.
