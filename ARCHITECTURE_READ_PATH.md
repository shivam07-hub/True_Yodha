# The Read Path — one contract for every surface
### Settled 2026-08-07 · Shivam + Claude · supersedes per-endpoint improvisation

This is the design document for how Myro answers a read. It exists because the
same class of bug appeared three times in two days, each time on a different
endpoint, each time "fixed" locally — and because Finlatics is about to send
hundreds of concurrent users at a system that currently supports about 1.5.

Everything here is measured on prod. No estimates.

---

## 1. The scarce resource, named

> "General-purpose products fail because nothing is named scarce." — Brooks

Myro's scarce resource is **concurrent reads against the shared Postgres**.

It is currently **12**, process-wide, shared by admin + authed + batch traffic
(`backend/app/services/read_capacity.py`, `supabase_read_max_inflight=12`,
250ms queue, then a 503).

That number was never a design decision anyone made on evidence. It was built to
fix a diagnosis — "blocked connection capacity, not compute" — that measurement
later disproved: 24 of 60 connections, 2 active. The bulkhead outlived the theory
and became the ceiling.

**Price one user arrival against the budget:**

| | |
|---|---|
| Capacity | **12** concurrent reads |
| `/home/bootstrap` fan-out | **8** concurrent sections, ≥1 read each |
| Concurrent dashboard loads before the 13th read queues 250ms then 503s | **~1.5** |
| Required for Finlatics | **100s** |

No query tuning closes a gap like that. One screen spends two-thirds of the
budget for one user.

**The tell, so it's recognisable next time:** `/public/stats` returning at
exactly `1004, 1004, 1004, 1004, 1003ms`. Identical durations across unrelated
endpoints are never N slow endpoints. They are one queue draining. The same
signature is on the authed cluster — `post-signin 3365ms`, then `scores/me`,
`notifications/unread-count`, `feed-state`, `agent-picks` all landing at
~1,52x ms.

---

## 2. The read contract (LOCKED)

> **Any user-facing request may issue at most 3 concurrent DB reads and must
> answer in under 500ms at p95.**

Anything that cannot be served within that budget does not get an exemption. It
gets precomputed, or it moves off the request path. This is a build-time rule,
not an aspiration — it is the thing to check in review before merging a new
endpoint.

### The three tiers — the whole mental model

A developer must be able to predict what a request costs from a single
consistent model. There is exactly one:

**Tier 0 — Precomputed.** Answers a question about *the corpus*, not about the
user. Lives in a snapshot table or materialized view, refreshed on ingest.
Costs **one indexed read**.
*Every public surface MUST be Tier 0. No exceptions.*
Live examples: `market_analytics_snapshot` (`/public/stats`, 1.2ms),
`job_search_index` (global search, 177ms from 4,284ms).

**Tier 1 — User-scoped point reads.** Answers a question about *one user*, by
primary key. Costs **≤3 reads**.
Examples: `/users/me`, `/scores/me`.

**Tier 2 — Composed.** Anything needing more than 3 reads. Not allowed on a
user-facing path. It either becomes Tier 0 (precompute the answer) or moves to
the worker and stores its result. `/home/bootstrap` is Tier 2 today and is the
single largest consumer of the budget.

### Freshness contract

Tier 0 data is stale by construction. That is fine. **Silently stale is not.**

Every Tier 0 surface carries its computed-at stamp, rendered with the format
already live on the platform — `formatRelativeAge` in `frontend/lib/format.ts`,
the same one behind "Listing confirmed live 2 hours ago"
(`components/jobs/listing-liveness.tsx`). Relative age, plain language. Not a new
format, not an absolute timestamp.

### Degradation contract

**A read path never returns 503.** When budget is exhausted, serve the last
known-good precomputed value with its freshness stamp. A user who sees slightly
old results keeps using the product; a user who sees an error leaves and tells
the partner who sent them.

This replaces today's behaviour, where `ReadCapacityLimiter` sheds real users —
the `/home/bootstrap` and `/scores/map` 503s in the alert mails are Myro
rejecting Myro's own traffic.

---

## 3. One surface, not a partner fork (LOCKED)

Partner users arrive authenticated: Finlatics → SSO session → magic link →
`/auth/callback`. They never touch the public pages.

**They land on the same job-browse surface a normal user gets when they browse
without uploading a CV.** Not a partner-specific screen, not a partner-specific
code path.

This is the conceptual-integrity decision and it is the most important one in
this document. A separate partner experience would mean two funnels, two sets of
bugs, and two definitions of "fast". One surface means every improvement to it
serves both audiences, and there is exactly one thing to make fast.

**Search is the hook; the CV is the conversion.** Partner traffic feeds stage one
rather than competing with it. Every job card carries "see your real fit for this
role", which requires a CV. That gap — the exact distance between you and a
specific job — is the thing Naukri and LinkedIn cannot show. It is the reason the
CV gets uploaded.

### The single behaviour

Today the no-CV surfaces (`CVRequiredNudge`, `CVPrerequisiteCard`) push only
`/cv`. Meanwhile `onboarding_complete` is returned by the API
(`backend/app/schemas/users.py:31`, `frontend/lib/api.ts:373`) and has **zero
consumers in the frontend** — the backend tracks the state and the UI ignores it
entirely.

So a browsing user is nudged toward a CV upload but never toward finishing
onboarding, and the app points at two things or none. Both nudges should surface
the onboarding CTA alongside the CV CTA, driven by `onboarding_complete`, so the
whole app points at one behaviour. That consistency is itself a trust signal.

---

## 4. Why latency is the strategy, not the plumbing

Delta 4 (Kunal Shah): a product must be ≥4 points better than the alternative on
a 10-point scale, and the improvement must be **irreversible** — once you have
it, you cannot go back to the old way.

For a job seeker the alternative is Naukri or LinkedIn. A 6-second first screen
makes Myro delta-*negative* regardless of how good the matching is. Users do not
file bug reports about this; they leave. Myro's own funnel already says so —
201 of 208 signups never tried a CV.

Finlatics traffic is **borrowed trust**. A slow first screen does not just cost a
user, it spends the partner's credibility. That is the wrong kind of
irreversible.

The read contract above is therefore not infrastructure hygiene. It is the
precondition for the product being better enough to be worth switching to.

---

## 5. Sequence — the order is load-bearing

**S0 — Global search. ✅ DONE, live on prod** (PR #285). `job_search_index` +
`search_jobs_global`. `engineer` 4,284ms → 177ms, `quantum` 12,415ms → 22ms.
Verified on prod: correct hit counts (12/12/0), no 503s across every term shape.

**S1 — The arrival surface. ✅ DB fix live on prod (no deploy needed); one
sequential round trip named and deliberately left open.**

`MarketJobsTab` renders unconditionally regardless of `hasCv` — `/jobs/feed`
IS the no-CV browse surface, confirmed by reading `app/(authed)/market/page.tsx`
(only the heatmap tab gates on `hasCv`). `pickDefaultSort(hasCv, hasTargetRoles)`
returns `"fresh"` for exactly the no-CV cohort, so `sort=fresh, page=1, no
filters` is the literal request a Finlatics arrival sends.

Measured on prod before any change: **8,607ms → 503**, then 2,316ms, 880ms.
Root cause was the fourth instance of the same trap in two days:
`is_active AND listing_confidence='active' ORDER BY first_seen DESC LIMIT 20`
could not be served as an ordered index scan — `first_seen` is a date
marker with only **17 distinct values** across 11,207 live rows, so even a
single-column `(first_seen DESC)` partial index left a 937ms Incremental Sort
inside each ~660-row day-bucket. The composite index
`idx_jobs_live_first_seen_job_id (first_seen DESC, job_id DESC) WHERE
is_active IS TRUE AND listing_confidence = 'active'` matches the query's
`ORDER BY` exactly:

  DB-paginated fresh browse:  3,080ms → **3.2ms**
  in-Python CAP-500 fetch (users with any saved/dismissed job): → **26ms**

Migration `20260807b_jobs_live_feed_index.sql`, applied `CONCURRENTLY`,
already live on prod (DB-side, same as S0's search fix, needs no deploy).
Re-measured end-to-end on prod after: 1,569 / 895 / 603 / 574ms, zero 503s —
correct, but still above the 500ms p95 budget.

**What's left is structural, not a query:** `job_feed` makes three
*sequential* round trips — the personalization prelude, then `feed_jobs`
(now ~3–26ms), then `get_cached_match_evals` for the brain-ranked badges.
Each round trip to Supabase appears to carry roughly 150–300ms of fixed
overhead in this path (the same floor `/companies/{slug}` settled at after
its own index fix). Three sequential calls floors this endpoint near
450–900ms regardless of query speed.

The obvious-looking fix — skip `get_cached_match_evals` when the user has no
CV skills, since `_rank_feed_rows(rows, {})` is behaviourally identical to
never calling it — is **not safe as stated**: `canRankByFit` returns true off
`hasCv OR hasTargetRoles`, so a user with target roles set but no CV can still
default to `sort=fit` and have warmed evals. Skipping the read on "no CV
skills" alone would silently drop real badges for that cohort. Left open,
named precisely rather than shipped on an unproven assumption — this is a
business-ranking read path, not a snapshot to overwrite on a hunch.

**S2 — One behaviour.** Surface the onboarding CTA next to the CV CTA in both
nudges, driven by the already-existing `onboarding_complete`. Cheap, and it is
the difference between an app that asks for one thing and an app that asks for
nothing in particular.

**S3 — Shared cache.** Move the per-process dicts (`_indexable_companies_cache`,
`_pulse_cache`, `_analytics_cache`, `_search_cache`, `/public/stats`) to Redis —
already provisioned for RQ — with **single-flight** and
**stale-while-revalidate**. No user ever waits for a cache fill. This is the
prerequisite for horizontal scale: today each new replica is another cold cache
and another stampede, so adding replicas first makes things worse.

**S4 — Decompose `/home/bootstrap`** from 8 concurrent sections to ≤3, per the
contract. Above-the-fold first; everything else lazily, after paint.

**S5 — Then, and only then, raise or delete the 12-slot cap and add replicas.**
Removing the bulkhead before S1–S4 lets slow queries hit Postgres unthrottled,
which is the failure the bulkhead was built to prevent — it was aimed at the
wrong cause, not at nothing.

**S6 — Re-measure instance sizing** once `jobs` has left the hot path. Buying
compute before S1–S5 would mask the defects rather than fix them.

Also queued, smaller: `/jobs/companies/pulse` (6,680ms) → Tier 0;
`run_concurrently` builds a fresh `ThreadPoolExecutor` per call (unbounded thread
creation under load) → one shared bounded pool; `get_supabase()` is not
`lru_cache`d while both admin clients are, so every authed request builds a
client whose connection pool starts empty.

---

## 6. What this design is NOT for

> "Constraints are friends. Ask what the design is NOT for." — Brooks

- **Not** real-time job data. Tier 0 is stale by construction, stamped honestly.
  If a surface genuinely needs the live row, it is Tier 1 and reads by primary
  key.
- **Not** a partner-specific experience. One surface. If a partner needs
  something different, that is a product decision to re-open here, not a branch
  to add quietly.
- **Not** arbitrary user-defined queries. Search is a fixed shape over a
  precomputed index. Freeform filtering that cannot use the index does not get
  added to the request path.
- **Not** horizontal scale before S3. More replicas without a shared cache
  multiplies stampedes.

---

## 7. Still open

- Prod replica count for `mirror-backend-prod` — unverified; feeds S5.
- Whether the 8s `statement_timeout` should move. It is currently a cliff that
  throws away completed work. Do not touch before S1–S4.
- `job-listing-verifier` shares this database: `claim_verify_targets` mean
  4,680ms, `count_verify_due` mean 1,809ms, 2.2h of DB time. Not yet EXPLAINed.
