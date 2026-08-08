# Read-path performance playbook
### The method. Tracked in the repo on purpose — `.claude/` is gitignored.

`/read-path-perf` is a thin loader that points here. **This file is the single
source of truth**; the skill carries no method of its own, so the two cannot
drift. Codex, a fresh clone, and a new session all read this — a skill would be
invisible to every one of them.

---

> Every latency incident in this codebase was diagnosed wrong at least once
> before it was diagnosed right. Twice the wrong diagnosis got a mitigation
> built on top of it. This playbook exists so the next one is measured, not
> guessed.

**Read [ARCHITECTURE_READ_PATH.md](ARCHITECTURE_READ_PATH.md) first.** It holds the
contract, the tiers, and the log of what has already been fixed. This file is
the *method*; that one is the *state*.

---

## Rule 0 — measure before you theorise

A theory that has not been measured is not a diagnosis, and a fix built on one
becomes the next bug. Three real examples from this codebase:

- "It's connection capacity" → measured **24 of 60 connections, 2 active**. A
  `BoundedSemaphore(12)` had already been built on that theory, and it became
  the actual ceiling — shedding real users with 503s.
- "`count_for_user` sets the wave's wall time" → asserted, then doubted on
  payload-size reasoning, then instrumented: it was slowest in **11 of 12**
  samples. The first guess was right and the second wrong. **Neither was worth
  acting on.**
- "`@lru_cache` on `get_supabase()` is a safe one-line win" → it is a
  **cross-user data leak**. `get_supabase_for_token` mutates the client.

If you cannot state the number you measured, you have not finished step 1.

---

## The loop

### 1. Rank by total time, not by what looks slow

```sql
select calls, round(mean_exec_time) as mean_ms, round(total_exec_time) as total_ms,
       substring(regexp_replace(query,'\s+',' ','g'), 1, 200) as q
from pg_stat_statements
where query not ilike '%pg_stat_statements%'
order by total_exec_time desc limit 10;
```

`mean × calls` finds the fire. A single slow log line finds a spark. The
biggest consumer here was ranked #1 by total time and had never appeared in an
alert email.

### 2. Read `max_ms` as a ceiling, not a cost

`max_ms` clustering at **~7,9xx** is the `authenticator` role's
`statement_timeout=8s` **killing** the query mid-scan. It is not what the query
"takes". A failure at a round number is always a ceiling — find which layer
owns it.

### 3. EXPLAIN the real query shape

```sql
explain (analyze, buffers) <the exact query, including its ORDER BY and LIMIT>;
```

Never conclude "there's an index on that column" from `pg_indexes`. **Read
which index the plan names.** Check `Heap Fetches` and `Buffers: read` vs `hit`.

### 4. Check the four traps

This codebase has been bitten by each. Check all four before writing code.

| Trap | Signature | Real example |
|---|---|---|
| **Partial index the planner can't prove** | Index exists, plan seq-scans | `idx_jobs_company_name_trgm` partial on `btrim(x) <> ''`; `ILIKE` can't prove it. **14,821ms → 19.6ms** |
| **Expression index ≠ column** | Same, on a `coalesce(...)` index | `idx_jobs_job_title_trgm` on `coalesce(job_title,'')`; querying the bare column. **6,972ms → 265ms** |
| **Sequential round trips** | Total DB time ≪ endpoint time | `/jobs/matches`: ~35ms of DB work, 1,242ms endpoint. Six sequential hops |
| **Payload weight** | Fast query, slow response | `job_description` was **59.8%** of `/jobs/matches` — and every consumer truncated it anyway |

**The tell for trap 3:** add up the EXPLAIN times. If they total far less than
the endpoint's `x-process-time`, you are paying round trips, not query cost.
This path's floor is **~165ms per round trip** — cost tracks *payload size*,
not hop count (a 2-hop `/scores/me` is 216ms; a 1-hop `/cv/versions` is 281ms).

### 5. Instrument fan-outs before optimising one

A fan-out's wall time is `max(section)`, so every other section is free and
**which one is the max is invisible from outside**. Optimising the wrong member
buys exactly nothing.

```
railway logs → grep "metric fanout.slow"
metric fanout.slow label=jobs.matches total=810ms slowest=new_jobs_count:807ms
  sections=4 | new_jobs_count=807ms raw_stack=563ms dismissed=463ms feed_ts=236ms
```

Take **10+ samples**. Which section wins varies; one sample is an anecdote.
A slowest-member that *changes every sample* is **contention**, not a slow
query — look at connection setup and pooling, not the SQL.

### 6. Re-measure on the live endpoint

SQL-level wins do not automatically become user-visible wins.

```bash
curl -s -o /dev/null -D - -H "Authorization: Bearer $TOKEN" "$API/path" | grep -i x-process-time
```

Sample 5+ times. **The first sample after a deploy is always cold** — the
per-process caches and `_provisioned_users` guard are empty. Discard it or say
it is cold; do not report it as the result.

---

## Fixing: prefer in this order

1. **Make it Tier 0** — precompute the answer (snapshot table / matview,
   refreshed on ingest). `/public/stats` is 1.2ms this way.
2. **Fix the index** so the planner can use it. Cheapest real fix; often
   `CONCURRENTLY`, no deploy, no lock.
3. **Collapse round trips** — one `run_concurrently` wave, or one RPC for
   *dependent* hops (a wave cannot help those).
4. **Trim the payload** — but trace every consumer first. Something always
   renders the field you were about to delete.
5. **Raise a limit** — last, and only with the measurement that justifies it.

---

## Hard-won constraints

- **`main` is production.** Only merge to `Develop`. DB migrations reach prod
  *immediately* (one shared Supabase); code does not.
- **Migrations: additive and reversible.** `CREATE INDEX CONCURRENTLY` takes no
  write lock and cannot run in a transaction. A generated column **rewrites the
  table** and takes `ACCESS EXCLUSIVE` — prefer an expression index.
- **Never cache a mutable client.** `get_supabase_for_token` writes the
  Authorization header onto the client. Share the **transport** (connection
  pool); never the client. See `test_database_client_isolation.py`.
- **INFO logs vanish.** The `app` namespace has no handler, so anything below
  WARNING is dropped. Metric lines must be `.warning()`.
- **The read contract:** ≤3 concurrent DB reads per user-facing request, p95
  < 500ms. `test_read_contract.py` enforces the structural half in CI.

## Before you say it is fixed

- [ ] Measured before **and** after, on the live endpoint, warm
- [ ] The number moved — if it did not, **the diagnosis is wrong**, not the fix
- [ ] Every consumer of a changed payload traced in code, not assumed
- [ ] A test exists that fails if this regresses
- [ ] `ARCHITECTURE_READ_PATH.md` updated — including anything you got wrong
