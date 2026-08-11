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

### Journey-compute contract

The database tier answers **where** data comes from. Journey priority answers
**when the user has earned the cost**. A visible component or navigation link is
not permission to fetch its data.

| Priority | User meaning | Loading rule |
|---|---|---|
| **J0 — Now** | Required for the decision the user is making on this route | Start immediately; return the smallest useful payload |
| **J1 — Next** | High-probability next action | Reuse cached state or run a cancellable low-priority prefetch only after J0 settles |
| **J2 — Intent** | Optional detail or secondary surface | Fetch on specific intent: open, search, tab selection, or near-viewport intersection |
| **J3 — Offline** | Corpus computation, maintenance, and operational reporting | Worker/precompute path; never compete with J0 |

Priority is contextual, not a permanent label on a route. Intel is J2 while a
user is working in Jobs; its core result becomes J0 when the user explicitly
navigates to `/intel`. Optional drills inside Intel remain J2. Route changes
cancel or abandon lower-priority work from the previous surface.

**Review rule:** every new request must name both its data tier and its journey
priority. "The component mounted" and "the browser is idle" are not user
decisions. Broad page-level pointer/scroll gates are insufficient for J2; the
trigger must belong to the component whose data is being requested.

Verified open violations, 2026-08-12:

- authenticated navigation mounts reads for applications, profile, and CV
  versions on every page even though the primary tabs are always visible;
- `/market`'s Wave 3 treats any scroll, pointerdown, or keydown as intent for
  several analytics consumers rather than the specific consumer entered;
- a public company page server-fetches jobs, company/posting notes, company
  detail, and skill intelligence together before first paint. The alert pattern
  (`/companies/{name}`, `/jobs`, `/skill-intelligence`, `/comments` slow in one
  burst) is the exact request graph in code.

These are named for the next demand-reduction pass. They are not silently
declared fixed by the database work below.

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

### The single behaviour — ✅ DONE

The nudge on the real browse surface (`jobs-tab.tsx` — `MarketJobsTab` renders
unconditionally, confirmed the actual no-CV landing view in S1) pointed only at
`/cv` and was gated on `hasCv` alone. `onboarding_complete` was returned by the
API and had zero frontend consumers, so a user with a CV who never picked a
target role and saved a first shortlist — `onboarding_complete` only flips on
`credible_job_saved`, per `onboarding_first_role.py` — saw no nudge at all.

Fixed: the nudge now gates on `!onboardingComplete`, not `!hasCv`, and always
links to `/onboarding` — which already self-resolves to wherever the user
actually is (upload → result → target/shortlist → `/market` once done; read in
`app/onboarding/page.tsx`). Copy is state-aware (`hasCv` picks between "Upload
your CV" and "Finish setting up your profile") but the destination and the
underlying behaviour are the same for both. One nudge, one destination, correct
for every state without new UI. Verified live with the QA account
(`has_cv=true, onboarding_complete=false`): nudge reads "Finish setting up your
profile" → `/onboarding` → lands exactly on that account's real next step
(confirm-CV-skills), not a generic re-upload prompt.

Confirmed pre-existing and NOT touched: `CVRequiredNudge`
(`components/common/cv-required-nudge.tsx`) is fully built but has zero import
sites anywhere in the app — dead code, flagged separately rather than folded
into this change. Mobile's `JobsSurface` has no equivalent nudge at all today;
also flagged rather than silently left unmentioned, not built in this pass —
new mobile UI needs its own verification pass, not a rushed addition inside a
backend-latency-focused sequence.

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

**S3 — Shared cache. ✅ Primitive built + three highest-measured-impact caches
migrated; the rest named and left open.**

Built `backend/app/services/shared_cache.py` — one reusable
`get_or_compute(key, compute, ttl_seconds, stale_seconds)`. Redis-backed when
Redis exists (all deployed tiers, ADR-0008 — same `settings.redis_url` +
per-process-dict-fallback pattern already established by
`app.services.background.debounce`, which it also reuses directly for its
single-flight lock rather than inventing new lock logic). Contract:

  fresh    -> return cached, no compute.
  stale    -> return the STALE value immediately, kick a single-flight
              background refresh (`debounce.claim` guards it: at most one
              refresh per key across every replica, not one per request).
  absent   -> compute inline (nothing else to serve), single-flight-guarded
              so a cold-start burst doesn't all pay full cost.
  Redis error -> fail open, compute() runs directly, uncached.

A background refresh has no caller waiting on its `Future` — nothing ever
calls `.result()` on it, so a naive version would let a failed refresh vanish
silently. Fixed before it shipped: `_background_refresh` wraps only the
pool-submitted call and logs `shared_cache.background_refresh_failed`; the
synchronous (cold-miss) path stays exception-transparent, since that caller
is the one thing seeing the error and needs it for its own fallback. Covered
by `test_shared_cache.py` (5 tests: fresh short-circuits, stale serves-then-
refreshes, concurrent stale hits refresh at most once, a failed background
refresh is logged not silent, a broken Redis connection fails open to direct
compute).

Migrated: `/public/stats`, `fetch_indexable_companies`, `fetch_company_pulse`
— the three named in the original saturation alerts (`/jobs/companies/pulse`
hit 10,915ms cold on prod). `fetch_company_pulse`'s cache key is now
order-normalized (`sorted({casefold})`); the OLD per-process cache keyed on
`frozenset(names)` but returned whatever order the FIRST caller for that set
had asked in — a second caller requesting the same companies in a different
order got a cache hit in the wrong order. `shared_cache` fixed this as a
byproduct of normalizing the key, not as a separate change.

**Still on the old per-process-dict pattern, not yet migrated:**
`_analytics_cache`, `_search_cache` (superseded in spirit by `job_search_index`
from S0, but the repository method still has its own dict), `_heatmap_cache`,
`_heatmap_row_cache`, `_gap_signal_cache`, `_entity_skills_cache`,
`_company_search_cache`, `_feed_page_cache`, `_feed_personal_cache` (the two
that back `/jobs/feed`, S1's remaining sequential-round-trip cost lives
downstream of these), `_user_skill_keys_cache`, `_user_target_locations_cache`.
Each is a mechanical migration onto the same primitive — swap the dict
get/set for `shared_cache.get_or_compute`, pick a `stale_seconds` — not a new
design decision. Left open rather than rushed across a dozen call sites in
one pass; each is real but none was named in a measured incident the way the
three migrated ones were.

**S4 — `/home/bootstrap`. ✅ Re-scoped after tracing real consumers; two
sections fixed, the "≤3 sections" framing was wrong and is corrected here.**

The original plan — decompose 8 concurrent sections to ≤3, defer the rest —
assumed `/home/bootstrap` was still the primary dashboard entry. It is not.
Tracing every frontend caller (`grep` for `home.bootstrap`) found exactly two:
`MissionHeroRail` (the desktop rail that mounts unconditionally alongside
`/market`'s feed — so a no-CV/partner arrival pays for both concurrently) and
mobile's `profile-surface.tsx`. Between them they read profile, score,
matches, applications, evidence, and diary — six of the eight sections,
nearly the whole bundle.

The seventh, `cv_versions`, looked like the obvious cut — neither of the two
direct consumers reads it. It is NOT dead: `use-nav-unlocks.ts` (gates nav on
every authed page) and `prep-room.tsx` each run their own
`useQuery({queryKey: dataKeys.cvVersions(null)})` and rely on this bundle
having already seeded that cache entry. Cutting it would not reduce a single
Postgres read — nav-unlocks needs the data regardless — it would just move
the read to its own uncached round trip on every authed page load. Checked
in code before cutting; not cut.

**The real defect, found by measuring each section standalone (prod,
QA account) against the whole bundle:**

  /home/bootstrap (all 8, concurrent)         1,333–2,011ms
  jobs/matches (standalone)                   1,618ms  <- slowest section
  cv/evidence (standalone)                    1,249ms
  users/me                                      537ms
  jobs/applications                             711ms
  diary/history                                 273ms
  cv/versions                                   211ms
  scores/me                                     234ms

`run_concurrently` is doing its job — 1,333–2,011ms is roughly max(sections),
not sum(sections) (~4,800ms) — so the fan-out design itself is correct, not
the problem. But because all 8 sections' underlying Postgres reads run
**concurrently**, one call to this endpoint can occupy up to 8 of the
process's 12-slot global read-capacity budget at once, for as long as the
slowest section takes. That is the actual contract violation — not the
JSON payload's field count.

Two fixes, evidence-based, both verified safe by reading every line after
the change:

  - `get_job_matches` ran `repo.record_recommendation_exposures(...)` — its
    own docstring calls it "best-effort" — synchronously on the read path.
    Nothing after that call reads its result. Deferred to `background_tasks`,
    the exact mechanism the same function already uses two lines below for
    `new_inventory.announce_for_user`. `TestClient` runs background tasks
    before returning (confirmed empirically — the test asserting
    `repo.exposures == [...]` still passes), so test coverage was
    undisturbed, not weakened.
  - `_evidence_stats` (the `cv/evidence` section) ran SIX repo calls
    sequentially — `latest_baseline`, `list_milestones`,
    `list_diary_log_dates`, `list_user_skill_sources`, `get_current_score`,
    `next_user_version_number`. 1,249ms / 6 ≈ 208ms — matching the ~150–300ms
    fixed round-trip overhead this Railway↔Supabase path carries even for
    trivial queries (the same floor `/companies/{slug}` settled at after its
    own index fix in S1). Only the *filtering* below needs `baseline`'s
    result; every fetch is independent of every other. Parallelized with
    `run_concurrently` — the same primitive `_resolve_feed_scope` already
    uses for an identical shape — filtering logic is unchanged, just fed
    from pre-fetched rows instead of fetching inline.

**Left open, not attempted:** `get_user_match_stack` and
`compute_match_health` (inside `get_job_matches`, the slowest section) are
match-scoring business logic, not a query-shape problem like today's four
index fixes — EXPLAIN-driven root-causing there risks correctness bugs in
scoring, which is worse than a slow read. Needs its own dedicated pass, not a
guess under this pass's time budget.

**S5 — ✅ Cap raised 12 → 40; replica count checked; NOT a load-tested number.**

Verified via Railway rather than assumed: `mirror-backend-prod` runs **one
replica** today. So "adding replicas multiplies stampedes" (S3's original
worry) hasn't started happening yet — it's a real risk for whenever a second
replica is added, not a live one now. That single replica's `12` was the
entire prod service's concurrent-PostgREST-read budget, and it was provably
too tight for the stated target on its own terms: S4 measured that one call
to `/home/bootstrap` can occupy up to 8 of those 12 slots by itself, so two
concurrent dashboard loads already exceeded it before any partner traffic.

Also found while reading `config.py` to make this change: `sync_threadpool_tokens`
(the AnyIO thread limiter under every sync route) was **already** raised
40 → 100 for this exact reason, and its own comment already establishes that
PostgREST pools its own Postgres connections independent of how many
concurrent HTTP requests reach it — so this Python-side semaphore was never a
literal Postgres-connection count, only a self-imposed throttle on top of it.
That significantly de-risks raising it. `supabase_read_max_inflight` raised
`12 → 40`, same file, same reasoning, cited explicitly in the comment so the
two settings tell one coherent story instead of two.

**Named, not hidden: this is a reasoned estimate, not a load-tested
guarantee.** `get_user_match_stack` / `compute_match_health` (inside
`get_job_matches`, S4's slowest section) are still slow and were deliberately
left un-root-caused this pass — scoring business logic, not a query-shape bug
like S0/S1's index fixes, and guessing there risks a correctness bug in
scoring, worse than a slow read. Raising the cap gives more of those
still-slow requests room to run concurrently, which is real residual risk.
Verify under genuine concurrent load before trusting headroom beyond this
number, and revisit alongside the Supabase compute-tier decision `config.py`
already flagged for the sibling setting.

**S6 — Re-measure instance sizing** once `jobs` has left the hot path. Buying
compute before S0–S5 would mask the defects rather than fix them. Not done
this pass — needs the S5 cap change to run under real traffic first.

**S7 — `/jobs/matches`. ✅ Root-caused and fixed. Was the top open risk behind
S5's cap increase; it is not scoring logic and never was.**

S4 deferred this as "match-scoring business logic, needs its own pass". That
framing was wrong, and the measurement says so plainly. Prod, QA account,
15 match rows:

  match-stack join (user_job_matches -> jobs)   29ms  index-backed nested loop
  dismissed-cards read                          1.2ms
  new-inventory count                           2.6ms
  --------------------------------------------------
  total database work                          ~35ms
  measured endpoint floor                   1,242ms

**`compute_match_health` is not a cost centre at all.** It returns on its
first branch whenever `match_rows` is non-empty, doing zero extra reads. The
suspicion recorded in S4 and S5 was simply wrong; corrected here rather than
left to mislead the next reader.

The ~1,200ms was five to six SEQUENTIAL round trips at this path's ~150-300ms
fixed overhead each — the third instance of that shape after `_evidence_stats`
(S4) and `/jobs/feed` (S1). One hop was pure waste:
`get_dismissed_job_card_ids` ran TWICE per request, once inside
`get_user_match_stack` to filter and again to build `dismissed_job_ids`.

Fixed in two steps: read it once and fan out concurrently (890-1,156ms), then
collapse the last dependent hop by fetching the stack unfiltered inside the
same wave and applying the dismissed filter in Python — equivalent, because
exclusion is set membership on `job_id` over an already-deduped stack.
Measured after both: **663-1,017ms warm.** The remaining floor is
`new_inventory.count_for_user`, itself two *dependent* round trips
(`last_match_run_at` -> `count_new_jobs_since`), which now sets the wave's
wall time. Collapsing that pair needs one RPC and is the next honest step, not
done here.

**Payload, a second and separate finding.** `job_description` was **59.8% of
the /jobs/matches payload** — 56KB of 93KB for 15 matches, averaging 3,734
chars. Every consumer but one already truncates it (card snippet 200 chars,
every mobile surface `.slice(0, 260)`); the sole full-text consumer is
desktop's `JdPanel`, which only mounts when the user opens the JD tab. List
payloads now carry 600 chars plus `job_description_truncated`, and `JdPanel`
fetches the remainder from `GET /jobs/{job_id}/description` only when the text
was actually cut. Verified live on dev against the identical 15-job set:
**93,543 -> 46,513 bytes, a 50.3% cut**, `job_description` down from 59.8% to
18.3% of the payload; the on-demand endpoint returns the full 6,149-char JD in
242ms.

**Mobile needed no change, and that is a finding rather than an omission** —
every mobile `job_description` use is already a 260-char slice, so a 600-char
snippet is strictly more than it consumes. A guard test fails if the bound is
ever lowered below 260.

Verified in the browser on the real authed surface: `JdPanel` renders, and
the fetch correctly does NOT fire for an untruncated description (confirmed
via the network log). **Not verified in the browser: the truncated ->
fetch-the-rest path**, because this QA account's Collections has no card with
a long JD (all 15 matches are currently rejected as dead/wrong-level, and its
one added job has a 16-char description). That path is verified at the API
level only.

Also queued, smaller: `run_concurrently` builds a fresh `ThreadPoolExecutor`
per call (unbounded thread creation under load) → one shared bounded pool
(the same defect named and deliberately avoided when `shared_cache.py`'s own
background-refresh pool was built in S3); `get_supabase()` is not
`lru_cache`d while both admin clients are, so every authed request builds a
client whose connection pool starts empty.

**S8 — `new_jobs_count`. ✅ Root-caused and fixed. It was never a slow query;
it was an Index Only Scan that heap-fetched 40% of its rows.**

The 2026-08-08 incident: a real user signs in, and `jobs.matches` reports
`total=8350ms slowest=new_jobs_count:8348ms` — 99.9% of the wave in one
section — while `/jobs/feed` read-timed-out at 12,317ms and `/public/stats`
took 6,942ms in the same seconds.

Measured before theorising, and the section's three hops are NOT equal:

    last_match_run_at (user_profiles)   mean   0ms   max    13ms
    legacy MAX fallback (user_job_matches) mean 1ms   max    15ms
    count live jobs since marker        mean 217ms   max 7,399ms

Two of the three are free. The third is the whole section — and its own
28-day distribution was **min 0ms, mean 217ms, stddev 930ms, max 7,399ms**.
Same query, same plan, 460× apart. A spread like that is never query cost.

`EXPLAIN (ANALYZE, BUFFERS)` on the real shape, median-staleness marker
(2026-06-21, 53,982 matching rows), named it exactly:

    Index Only Scan using idx_jobs_ingested_at_active
      Heap Fetches: 21,438        <- 40% of rows fell through to the heap
      Buffers: shared hit=10,087  <- 79 MB touched to return one integer

The index is right and the plan is right. The **visibility map** was stale, so
"Index Only" was a label rather than a fact. And it stales continuously, not
once: heap fetches on this query grew **19,675 → 21,438 in fifteen minutes** of
ordinary verifier + skill-engine write traffic, watched live.

`shared_buffers` on this instance is **224 MB**; `jobs` is 171 MB of heap plus
248 MB of indexes. A user-facing read that touches 79 MB evicts a third of the
cache every time it runs — which is why unrelated endpoints degraded in the
same seconds, and why this statement's own *min* is 0ms.

One `VACUUM (ANALYZE) public.jobs`, applied to prod:

    Heap Fetches   21,438 -> 705    (30×)
    Buffers        10,087 -> 472    (21×, 79 MB -> 3.7 MB)

Made durable by migration `20260809_jobs_autovacuum_visibility_map.sql`:
per-table autovacuum scale factors 0.2 → 0.05 on `jobs`. Default 0.2 waited for
~18,000 dead tuples on this table, leaving hours-long windows where the map was
badly stale. Additive, reversible (`RESET`), no rewrite.

**Re-measured on prod, same QA account, after** — 5 samples, first cold:

    new_jobs_count   8,348ms (2026-08-08)  ->  2,637 / 525 / 536 / 537 / 503ms
    /jobs/matches                          ->  3.57 / 1.53 / 1.38 / 1.38 / 1.25s

~520ms warm, a 16× move. `new_jobs_count` is still the slowest member, but it
is now **round-trip-bound, not query-bound**: 3 sequential hops × this path's
~165ms floor ≈ 510ms. That makes the `count_for_user` → one-RPC collapse in §7
the next honest step, and for the first time the measurement predicts what it
will buy (~520ms → ~320ms, `raw_stack`-bound) instead of guessing.

**The over-budget line was a real finding, not noise.** `jobs.matches` fanned
out 4 sections against a budget of 3 and logged `fanout.over_budget` on *every*
load. The fourth member was `feed_ts` — `get_feed_updated_at`, a **corpus-wide**
value identical for every user, measured at `feed_ts=0ms` in 4 of 5 samples
because a per-process dict already had it. It was spending a thread and a slot
of the process-wide read budget on every request to return a cached constant.
Migrated to `shared_cache` (S3's primitive — it was already on S3's
not-yet-migrated list) and lifted out of the wave: 4 sections → 3, on budget,
no behaviour change. Guarded by `test_jobs_matches_fanout_is_within_its_budget`,
which counts wave *width* — the existing contract test counted the read *set*,
which never changed while this was wrong for weeks.

**What this did NOT fix, stated plainly.** The count still scans every live job
ingested since the user's marker — 53,982 index entries for a median-staleness
user, growing with the corpus. Post-vacuum that is 472 buffers, but the VM
stales again between vacuums. Bounding it (`LIMIT` at a cap, exact below it) is
a ~19× further cut to 30 buffers, and is **not done** because three surfaces
render the raw integer (`NewInventoryStrip`, `next-action.ts`,
`MatchRefreshGate`) — capping changes user-visible copy to "500+", which is
Shivam's call, not a latency fix to slip in.

**And the load that made a 16ms query take 7.4s is still there**, named with
numbers in §7 — it is background traffic, not users.

---

**S9 — Public Intel industry role families. ✅ Code complete; deployed payload
refresh still unverified.** The requested “jobs by industry” view could have
added another public endpoint over `jobs`, but that would violate the Tier-0
contract. Instead, `MarketAnalyticsCompiler` now counts `role_domain` within
each normalized industry while it already builds `market_analytics_snapshot`.
`/jobs/analytics` exposes the bounded `industry_roles` map from that same
payload, and `/intel` renders it without another request. Selecting an industry
also stops calling the older `/jobs/companies-at?industry=...` read; the city
drill remains on that endpoint.

Snapshot schema evolution is explicit: the dirty guard treats a payload without
`industry_roles` as stale even when job count and `last_seen` are unchanged, so
the next refresh rebuilds it instead of preserving an old-but-marker-current
JSON shape. Covered by compiler, router, and dirty-guard tests. Desktop and
375px browser layouts were verified locally with no overflow or framework error
overlay. The local frontend still read the currently deployed API, which does
not emit `industry_roles` yet, so populated role rows remain unverified until
the backend deploys and the snapshot refresh runs.

---

**S10 — Verifier health stopped counting the corpus. ✅ DB live; worker code
complete, deployment pending verification.**

The 2026-08-11/12 incident mails included `/health` at 8,020ms. Reproduced on
the live services before changing anything:

    prod /health app time     8,016.6ms -> verifier=unknown
    dev  /health app time     4,398.7ms -> verifier=ok

`/health` called `verifier_health_snapshot`, which called
`count_priority_verify_due`. That exact operational progress number rebuilds
the tracked/shown/matched priority set across three tables. It has no bearing on
whether the verifier is alive, yet it ran from the API health probe and again
after every verifier sweep. Over the current `pg_stat_statements` window:

    count_verify_due          1,147 calls  mean 1,934.9ms  total 2,219,314.8ms
    count_priority_verify_due 1,100 calls  mean   344.8ms  total   379,301.6ms

The old health snapshot itself measured **192.7ms and 26,416 shared buffers**
in a warm standalone EXPLAIN. Its replacement asks only the two dead-man
questions — latest claim attempt and latest productive verdict — with ordered
`LIMIT 1` reads matching the existing partial indexes. The candidate plan was
**4.5ms / 9 buffers**. Post-migration standalone execution under concurrent
traffic was **25.5ms / 1,239 buffers**, still a 7.6x time and 21x buffer move
against the old snapshot; the live endpoint is the deciding evidence:

    prod cold app time      8,016.6ms -> 647.3ms
    dev  cold app time      4,398.7ms -> 184.7ms
    prod/dev cached app time             0.7-1.0ms

Migration `20260811190435_verifier_health_heartbeat_fast_path.sql` is applied
and PostgREST reloaded. The JSON keeps `verifier_priority_backlog: null` for
wire compatibility. The worker no longer runs either exact backlog count after
every sweep; claim throughput, productive verdicts, and duration remain its
inline J3 health signals. The old count RPCs remain service-role-only for an
explicit operational investigation, not on a scheduled/user-facing path.

The cached live calls still took roughly 0.4-0.7s end-to-end while the app spent
under 1ms. That remainder is Railway edge/network time, not Postgres, and stays
open for the runtime/region lane. The DB fix must not be credited for it.

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

- **The background workers, not users, are what saturate this database.**
  Measured 2026-08-09 over a 28-day `pg_stat_statements` window. Ranked by
  *total* time, the top consumers are not on any user's request path:

      claim_verify_targets RPC   1,353 calls  mean 4,714ms   1.77h DB time
      count_verify_due RPC       1,079 calls  mean 1,867ms   0.56h
      jobs.company_name ILIKE    3,249 calls  mean 2,008ms   1.81h  (486 disk blocks/call)
      jobs, no WHERE, LIMIT/OFFSET 3,323 calls mean 406ms    1.35h  (473 disk blocks/call)
      count_jobs_missing_skill_floor() 8,359+709 calls       0.28h  (841 disk blocks/call)

  `EXPLAIN (ANALYZE, BUFFERS)` on `claim_verify_targets(p_limit := 25)`:
  **3,210ms, 14,645 buffers (114 MB) touched, 927 read from disk, 171 dirtied
  — to claim 25 rows.** It rebuilds three `DISTINCT` scans
  (`job_applications`, `job_recommendation_exposures`, `user_job_matches`) as
  `MATERIALIZED` CTEs on every call. Against a 224 MB `shared_buffers` that is
  the cache-eviction engine, and the verifier is currently *timing out and
  retrying* it (`httpx.ReadTimeout` in `job-listing-verifier` logs,
  2026-08-09 06:31), which multiplies the load.

  The `/companies/{name}` fan-out fires **every ~70 seconds around the clock**
  (continuous `fanout.slow label=companies.detail` in Railway, 2026-08-08
  16:12→2026-08-09 06:34, 500–2,900ms each). That is crawler traffic on a
  public page, sharing one buffer cache with every authed read.

  This is the standing answer to "why did a 16ms query take 7,399ms". Not yet
  fixed — each needs its own pass, and `claim_verify_targets` in particular is
  a background job that should not be competing with a signed-in user at all.
- **`new_inventory.count_for_user` — MEASURED, and it is the fix worth doing.**
  *(Updated 2026-08-09 by S8: the visibility-map fix took this section from
  8,348ms to ~520ms warm on prod, so the numbers below are the pre-vacuum
  picture. The RPC collapse is still the right next step — it is now the
  round-trip cost, ~520ms → ~320ms, and nothing else.)*
  `run_concurrently` now reports per-section timing (`metric fanout.slow`).
  12 samples of `jobs.matches` on dev:

      new_jobs_count   median 710ms   (min 443, max 1000)
      raw_stack        median 345ms   (min 306, max  661)
      dismissed        median 168ms   (min 163, max  463)
      feed_ts          median   0ms   (in-process cached)

  Slowest member in **11 of 12** samples: `new_jobs_count`. Collapsing its
  2-3 dependent hops into one RPC should take the wave to `raw_stack`-bound,
  ~710ms -> ~345ms. `dismissed` (median 168ms, one tiny read) is this path's
  one-round-trip floor, so a single-hop `new_jobs_count` lands near it.
  **Cheaper partial fix first:** 289 of 479 profiles have a null
  `last_match_run_at`, so most users hit the legacy
  `MAX(user_job_matches.computed_at)` fallback — a third hop. Backfilling that
  column removes one hop for ~60% of users with no code change.
  *(I twice guessed at this before measuring — first asserting it set the wall
  time, then reasoning from payload size that it probably did not. The
  instrumentation settled it; the first guess was right and the second was
  wrong. Neither guess was worth acting on.)*
- **`cv.evidence` contention — ✅ FIXED (shared transport), ⚠️ effect not yet
  re-measured.** Whichever section was slowest changed every sample —
  `baseline`, `skill_sources`, `next_version_number`, `current_score`,
  `milestones` all taking turns at ~420-480ms while the other five sat at
  ~160-175ms. Trivial reads cannot cost 430ms of query time; ~165ms is this
  path's one-round-trip floor. Cause: every authed request built a client whose
  httpx pool started empty, so a 6-way fan-out opened six fresh TLS connections.
  Fixed by sharing ONE `_RetryingHTTPTransport` (the pool) across clients.
  **The obvious version of this fix — `@lru_cache` on `get_supabase()` — is a
  cross-user data leak** and was nearly shipped: `get_supabase_for_token`
  mutates the client via `.auth(token)`, so a shared client shares one
  Authorization header and RLS returns another user's rows. Verified
  empirically, then fenced by `test_database_client_isolation.py`.
  **Owed:** re-read `metric fanout.slow` after this deploys and confirm the
  ~430ms outliers collapse toward ~165ms. If they do not, the diagnosis was
  wrong and the transport change is not the fix — say so rather than assuming.
- **Three DB-side items are specified but NOT applied.** The Supabase MCP
  connection dropped mid-session, so these could not be run or verified. Each is
  written out so the next session executes rather than re-derives — but **none
  is safe to apply blind.** Run the check first, in order:

  1. ~~**Backfill `last_match_run_at`**~~ — **DONE, and the reasoning behind it
     was wrong.** Checked 2026-08-09: the backfill UPDATE has already run
     (visible in `pg_stat_statements`), and 289 of 479 profiles are *still*
     null. That is not a missed backfill — those users have **zero
     `user_job_matches` rows**, so there is nothing to backfill from. For them
     the legacy fallback returns `None` and `count_new_jobs_for_user` returns 0
     **without ever running the count**: 2 cheap hops (0ms + 1ms), never the
     expensive one. The "third hop for ~60% of users" framing had it backwards
     — the null-marker cohort is the *cheap* cohort. Nothing left to do here.

  2. **`count_for_user` → one RPC.** Measured the slowest wave member in 11 of
     12 samples (median 710ms vs `raw_stack` 345ms). Collapsing its 2-3
     dependent hops should make the wave `raw_stack`-bound. **Two-step, and the
     order matters:** apply the migration FIRST, verify the function exists,
     THEN ship the code that calls it. Shipping the caller against a missing
     RPC 500s every dashboard load on merge to `main`.

  3. **Dropping the interim search indexes — DO NOT do this blind.** The four
     per-column trigram indexes (`idx_jobs_job_title_trgm_all`,
     `_location_city_`, `_location_country_`, `_role_domain_`) were interim for
     the old `.or_()` search, and prod is now confirmed on the RPC/matview path
     (`q=engineer` 645ms, no 503s). *But* `repositories/scores.py:290` also runs
     `job_title ILIKE`, so `idx_jobs_job_title_trgm_all` may still be
     load-bearing for a different caller. Check usage before dropping anything:
     ```sql
     select indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
       from pg_stat_user_indexes where relname = 'jobs'
        and indexrelname like '%trgm%' order by idx_scan;
     ```
     Only `idx_scan = 0` indexes are safe. The two long-dead ones
     (`idx_jobs_company_name_trgm` partial-predicate, `idx_jobs_job_title_trgm`
     on `coalesce(...)`) the planner has never been able to use are the safest
     candidates.

- **The truncated-JD fetch path is unverified in a browser** — API-level only.
  Needs an authed account holding a collection card with a >600-char JD.
- **The 12 → 40 cap is unverified under real concurrent load.** Reasoned from
  measurement, not load-tested. Prove it before trusting headroom beyond it.
- Whether the 8s `statement_timeout` should move. It is currently a cliff that
  throws away completed work.
- `job-listing-verifier` shares this database: `claim_verify_targets` mean
  4,680ms, `count_verify_due` mean 1,809ms, 2.2h of DB time. Not yet EXPLAINed.
- Every per-process cache not yet migrated to `shared_cache` — see S3's list.
- Mobile's `JobsSurface` has no onboarding/CV nudge at all — see S2.
- `CVRequiredNudge` is dead code (zero import sites) — see S2.
- `SkillDemandPanel` throws a "Maximum update depth exceeded" React warning on
  every `/market` load — found while verifying S2, confirmed pre-existing and
  unrelated by reproducing it with S2's changes stashed out. A fix already
  exists as an uncommitted local diff (`use-skill-demand.ts`, stable
  `EMPTY_SKILLS`/`EMPTY_CITIES` refs) — not authored this pass, not committed
  here; not this document's to claim done.
