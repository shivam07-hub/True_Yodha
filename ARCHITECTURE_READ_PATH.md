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

Verified journey notes, updated 2026-08-14:

- authenticated navigation no longer earns CV-version or applications reads;
  those caches are seeded by their owning journey. The shell's one profile read
  remains J0 because identity and CV presence change the chrome itself;
- `/market` no longer treats scroll, pointerdown, keydown, browser idle, or a
  button click as permission to finish loading visible rails. The Jobs rails
  are mandatory J1 content: they start automatically in a completion-driven
  cascade after identity + first feed settle. Optional drills inside those
  rails remain specific-intent J2.

The former public company-page fan-out is addressed in S11 below. The Market
rail correction is recorded in section 13.

The authenticated-navigation statement remains a standing constraint.

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

**S10 — Verifier health stopped counting the corpus. ✅ DB live; Develop API
deployed; worker deployment unverified.**

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

**S11 — Company-page secondary compute follows user intent. ✅ Develop.**

The alert mail repeatedly showed the same four-route burst for one company
visit:

    /companies/{name}/jobs
    /comments?entity_type=company&entity_id={name}
    /companies/{name}
    /companies/{name}/skill-intelligence

This was the server render graph, not four independent user decisions. The
company page now spends its J0 budget on the crawlable facts needed to answer
the route: live roles and company-level community notes. These still feed the
title/indexability decision, server-rendered role list, ItemList JSON-LD, and
truthful DiscussionForumPosting JSON-LD.

Skill demand and the roll-up of notes from individual job postings are J2.
Their React Query reads use `enabled` flags controlled by their own disclosure
buttons; mount, browser idle, scroll, and generic pointer activity do not earn
the request. The initial backend route graph therefore falls from **four calls
to two**. An anonymous comment thread also reuses the server seed instead of
immediately repeating `/comments`; an authenticated reader alone refreshes the
seed to resolve edit/delete ownership.

The browser pass also found that this public route mounted `useAuth()`, whose
contract is to redirect a resolved anonymous session to `/login`. The component
only needs session presence for Save and note ownership, so it now uses the
passive `useSession()` reader. Anonymous company exploration therefore remains
on the public route instead of paying for a render and then being ejected.

The deliberate SEO trade-off is bounded: company-level notes remain crawlable;
per-job notes are no longer duplicated into the company page's initial HTML or
used alone to make an otherwise-empty company indexable. They remain available
unchanged after the explicit user action. This is demand removal, not an empty
placeholder presented as data.

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

## 7. Historical open-item audit (superseded by section 8)

The bullets below preserve the measurements that led to the closeout. Their
"open" language is point-in-time evidence, not current status; section 8 is the
authoritative #16 state.

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

## 8. #16 closeout and launch-capacity gate (2026-08-13)

This section supersedes the stale open bullets in section 7 for #16. Every
application/database slice discovered by the latency-email audit is complete on
`Develop`, and every forward-only migration below is applied to the one shared
database. The platform is **not yet capacity-cleared for launch** because the
paid compute gate at the end of this section fails.

### Closed software slices

| Slice | Shipped result | Verified evidence |
|---|---|---|
| Verifier contention | Constant-time interest bookkeeping and schedule read models | `claim_verify_targets(25)` 3,210ms / 14,645 buffers → 28.6ms; `count_verify_due` 5.6ms |
| Feed query | Exact active-row index plus active-first plan | SQL plan 8,550ms / 13,670 buffers → 224ms / 499 buffers |
| Feed payload | List reads omit full job descriptions; detail is fetched only when opened | live feed about 14.9KB; route contracts green |
| Current-user hops | Seven feed-context reads collapsed into one RPC | feed-context route/migration tests: 73 passed |
| Cache stampedes | Shared cache cold fills use owner-token leases, bounded loser wait, and stale fallback; a late filler cannot release its successor | shared-cache/repository contracts green |
| Write amplification | Recommendation-exposure batches are debounced | exposure suite: 71 passed |
| Company journey | First render uses company summary + jobs; skill intelligence waits for intent | company journey contract green |
| Market journey | J0 is `/users/me` + `/jobs/feed`; desktop and mobile applications badges are passive, and notifications load one inbox request only after bell intent | Market journey contracts green |
| Read bulkhead | In-flight cap and HTTP keepalive pool agree at 40 | config and database contracts green |
| Fan-out threads | Request-local executors replaced by one process-wide pool bounded to the 40-read bulkhead | concurrent-read contracts green |
| New-inventory truth | Inbox-open re-derives the notification from trusted, browseable jobs; stale or unavailable counts are never rendered | direct count 7,295ms / 13,369 buffers -> 0.84ms / 91 buffers; auth-own 4,094, auth-other 0, anon denied |

Applied migrations:

- `20260813090000_read_path_closeout.sql`
- `20260813091000_verifier_schedule_read_model.sql`
- `20260813092000_verifier_diagnostics_schedule.sql`
- `20260813092500_verifier_schedule_payload.sql`
- `20260813092700_verifier_interest_index_cleanup.sql`
- `20260813092900_verifier_interest_constant_time_triggers.sql`
- `20260813094000_feed_active_first_seen_index.sql`
- `20260813094100_feed_active_index_predicate.sql`
- `20260813095000_feed_context_read_model.sql`
- `20260813114500_trusted_new_inventory_count.sql`
- `20260813115000_rederive_unread_new_inventory.sql`

The 4,095-role notification that prompted the new-inventory audit was not a
torn 12,108-row publish. The larger number counted every `is_active` row,
including listings whose confidence was `uncertain`, `likely_closed`, or
`closed`; jobs RLS correctly exposed only `is_active AND
listing_confidence='active'`. New importer rows default to `uncertain`, so an
in-progress source publish is not part of the promise to a student. The actual
faults were semantic and temporal: the later service-role RPC lost the trust
predicate, and the notification stored a point-in-time count indefinitely.
The corrected invoker RPC names the trust predicate explicitly for both caller
roles, and opening the J2 inbox re-derives the count before rendering it. A
partial trusted-inventory index keeps that explicit-intent read comfortably
inside the 500ms contract.

### Measured acceptance result

The locked acceptance target is zero failures and backend p95 below 500ms for
the current-decision reads. On the deployed dev API:

- warm `/jobs/feed`, five samples: **477ms backend p95 — pass**;
- warm `/users/me`, five samples: **934ms backend p95 — fail**;
- 10 simultaneous Market arrivals, 20 J0 requests: **2,161ms backend p95,
  2,635ms client p95, zero failures — fail**;
- the API's `/v1/status` remains about 1ms backend under a 40-request burst,
  isolating the bottleneck away from FastAPI/Railway request scheduling.

### The remaining launch gate is paid infrastructure

Live control-plane and SQL evidence: Supabase organization plan **Free**,
database compute **Nano**, database size **1,118MB**, `shared_buffers` **224MB**,
`max_connections` **60**, and **11** PostgREST authenticator sessions. Supabase
recommends at most 500MB database size for Nano. This database is already over
twice that recommendation and the concurrent-arrival measurement fails after
the query, payload, hop, cache, and journey work is complete.

Required launch sequence:

1. Move the Supabase organization to a paid plan and choose **Small compute or
   larger**. Micro retains the 60-connection class and is not an adequate
   launch experiment for this workload.
2. Run the read-only probe against dev with `market_arrival` at 10 users, then
   20 users. Require backend p95 <500ms and zero failures in both runs.
3. If Small fails, inspect database CPU/cache-hit/PostgREST wait evidence during
   the probe before choosing Medium; do not guess from endpoint wall time.
4. Only after the gate passes should the current `Develop` release be promoted
   to production by the repository owner.

Do not relabel this as an unfinished cache, index, or hop slice. Conversely, do
not mark launch capacity green merely because the software slices are closed.

## 9. Tier-0 refresh durability (2026-08-13)

Analytics, skill demand, and global search are J3 products. Their refreshes no
longer share one synchronous HTTP deadline or one analytics dirty flag.

- `POST /jobs/analytics/refresh-snapshot` persists refresh intent in one RPC,
  answers `202`, and runs the claimed work after the response.
- `snapshot_refresh_state` records each product's request, lease, attempts,
  last success, and last error. Claims use `SKIP LOCKED`; maintenance work
  cannot make the acknowledgement wait on a long-running refresh.
- Skill demand and global search have separate staggered hourly repair crons.
  The existing daily analytics cron remains unchanged until the asynchronous
  endpoint reaches production.
- The skill-demand read suppresses rows after 48 hours while retaining the
  computed-at stamp for operational truth. Silently stale demand is therefore
  no longer a valid degradation state.

The state table and orchestration functions are service-role-only. The live
ACL smoke test confirms `anon=false`, `authenticated=false`, and
`service_role=true` for all four internal functions; post-migration Supabase
advisors report no finding for this subsystem.

---

## 10. Best-fit warm restored as J1 (2026-08-13)

The `/market` feed had **no brain warm at all**. 3799e114 correctly took it off
the arrival path (it was wait-then-paint on a blocking-judgment LLM call) and
locked that with the "Jobs paints its J0 feed before secondary compute" contract
test; c73aa23a reintroduced it while consolidating something unrelated and left
`Develop` failing that test. What neither restored was a *deferred* warm, so a
first arrival under "Best fit" got pure deterministic overlap under a label
promising the brain's ranking, with `ranked_count = 0` and no path to ever
becoming ranked except opening cards one at a time.

**Restored as J1, not J0.** `components/market/use-feed-warm.ts` is its own
module so the contract test's guard on `use-job-feed.ts` stays meaningful rather
than a string the next refactor trips over. It gates on **J0 having settled** —
the feed query's own success/error — not on browser idle: this document's
journey-compute contract is explicit that "the browser is idle" is not a user
decision. The feed query's own settled state opens the gate, so a timer cannot
fire while J0 is still in flight. Fires at most once per (filters, scope, query)
key, cancellable, and invalidates that exact feed key only when `warmed > 0` —
a re-read that cannot change the answer is pure cost. Desktop and mobile call
the same hook.

**Second defect, found while reading it:** `_rank_feed_rows` floated
brain-warmed cards to the front **regardless of `sort`**. A user who chose
"Newest" got warmed-cards-first, so the two-way toggle was wrong on both of its
settings. Reordering is now gated on the resolved sort being `fit`; badges still
attach under `fresh` (a verdict is information — the order is the user's
instruction, and the two are not the same decision), and `ranked_count` returns
0 there because there is no leading ranked block to draw a divider after.

Also deleted: `useJobFeed`'s `warming: false`, hardcoded for consumers that no
longer existed.

### Measured — live prod, before the change

`GET /jobs/feed`, QA account, first sample discarded as cold (3,686ms):

| Sort | Warm samples (ms) | p95 |
|---|---|---|
| `fit` | 643.5, 548.8, 547.7, 561.3, 546.6 | ~643 |
| `fresh` | 643.9, 551.0, 952.6, 522.1, 523.3 | ~953 |

**This is a baseline, not a win.** The change touches no query — the reorder
gate is in-memory and the warm is a separate request after paint. J0 is expected
to be unchanged; these numbers exist so a regression is visible. Both sorts sit
**above the 500ms contract already**, consistent with section 8's finding that
the remaining gap is the paid compute gate, not application code.

### The cost this adds, stated plainly

The warm runs on `get_blocking_judgment_provider` (paid-strong lane) and ranks
up to `SHORTLIST_SIZE = 10` candidates. So a first `/market` arrival under "Best
fit" now costs up to 10 brain evals where it previously cost none. Bounded by
the eval context key (section: CONTEXT.md "Targeting Brief"): a repeat visit with
unchanged targeting is a full cache hit and costs nothing. The spend lands once
per targeting change per user, which is the behaviour "Best fit should be
brain-ranked on arrival" actually asks for — but it is new spend, not free.

### Open, not silently closed

- Nobody has watched the reorder land in a browser. The feed re-sorts a few
  seconds after paint; CONTEXT.md's Provisional Match reasoning ("a list that
  reorders under someone mid-read is worse than one that sharpens in place")
  argues for an affordance marking it. Deliberately not invented here — it is a
  design call.
- The journey-compute violation formerly named here is closed by section 13.

---

## 11. Follow-up latency-mail audit (2026-08-13)

The follow-up mails did not carry a timestamp or deployed commit SHA, so an
endpoint name alone cannot prove that an old alert describes the current code.
Live six-sample probes separated current route cost from historic/systemic
contention:

- `/public/stats` and `/jobs/companies/indexable` now spend roughly **25–40ms
  in the backend**. Their 2–9 second mail entries are not current query costs;
  they are consistent with an older build or the Nano queue draining under a
  concurrent corpus scan.
- `/jobs/companies/pulse` had one real **5,059ms cold fill**, then **28–37ms**
  warm. This is why the shared stale cache and single-flight lease are
  correctness requirements, not optional acceleration.
- `/companies/Wipro/skill-intelligence` remained roughly **0.8–0.9s**. It is a
  legitimate J2 latency, but it is no longer paid by the initial company-page
  journey; the disclosure action earns it.
- `user_notifications` unread SQL averages **4.11ms** over 1,749 calls in
  `pg_stat_statements`. The 3–5 second route wall times therefore came from
  queue/network contention, not a slow notification predicate. The client was
  nevertheless issuing unread-count and inbox together after bell intent. It
  now makes one inbox request, derives the badge from that response, and the
  compatibility count endpoint uses an exact count with a one-row payload.
- Mobile global chrome was still fetching `/jobs/applications` on every page to
  paint tab badges, and desktop chrome fetched CV versions for gates that no
  longer exist. Both are now passive/removed: Collections, Prep, or CV earns
  and seeds its own data.

This distinction is the operating rule for future mails: repeated multi-second
wall times do not make every named SQL query slow. Correlate the alert with a
build SHA, `Server-Timing`, and `pg_stat_statements`; remove unjustified journey
work, but treat co-timed fast SQL as a capacity/queue signal.

---

## 11. Company lookup — the #1 and #3 database consumers (2026-08-13)

Found by following the playbook's Rule 1 (rank by *total* time) while scoping a
feed precompute. **The feed was not the fire.** `pg_stat_statements`, ordered by
`total_exec_time`:

| # | calls | mean | total | query |
|---|---|---|---|---|
| 1 | 5,694 | 1,268ms | **7,222s** | `jobs WHERE company_name ILIKE $1 AND is_active AND listing_confidence='active' ORDER BY job_id LIMIT/OFFSET` |
| 3 | 3,249 | 2,008ms | **6,524s** | `jobs WHERE company_name ILIKE $1 ORDER BY first_seen DESC LIMIT` |

3.8 hours of database time between them, and `max_exec_time` on both pinned at
**7,9xx** — the `authenticator` role's `statement_timeout=8s` killing them
mid-scan. Per playbook step 2 that is a ceiling, not a cost.

### Cause

`.ilike("company_name", name)` is case-insensitive **exact** match here — no
call site has ever passed a wildcard. But `~~*` cannot use the btree on
`company_name`, so with `ORDER BY job_id LIMIT 50` the planner walked
`jobs_pkey` expecting to fill the limit early. It estimated 1,620 matches and
found 4, filtering 76,545 rows on the way:

```
Limit  (actual time=43884.624..44505.736 rows=4)
  Buffers: shared hit=68925 read=6421
  ->  Index Scan using jobs_pkey on jobs  (rows=4)
        Filter: (is_active AND (company_name ~~* 'Accenture') AND …)
        Rows Removed by Filter: 76545
Execution Time: 44517.826 ms
```

This is the family the playbook already names — an index exists, the plan does
not use it — but a *third* variant: not a partial predicate the planner can't
prove, and not an expression index queried on the bare column, but an operator
(`~~*`) that no available index serves, next to an `ORDER BY` that makes the
wrong index look cheap.

### Fix

Two expression indexes, `CONCURRENTLY`, no lock, additive:

```sql
idx_jobs_lower_company_active_jobid  (lower(company_name), job_id)
    WHERE is_active AND listing_confidence = 'active'
idx_jobs_lower_company_first_seen    (lower(company_name), first_seen DESC)
```

The partial predicate is simple column equality, so the planner can prove it —
unlike `btrim(x) <> ''`, which is what made `idx_jobs_company_name_trgm` dead.

An index only helps if the query names the expression, and **PostgREST cannot
express `lower(company_name) =` in a filter**. So both reads moved behind SQL
functions — `company_open_roles_page`, `company_jobs_for_notes` — both
`SECURITY INVOKER`, so RLS on `jobs` applies exactly as before. This is a plan
fix, not an access change.

### Measured

| | before | after |
|---|---|---|
| #1 shape (SQL) | 44,517ms / 75,346 buffers | **2.07ms / 5 buffers** |
| #1 through the RPC | — | **4.46ms / 5 buffers** |
| #3 shape (SQL) | mean 2,008ms | **27.4ms** |

**The endpoint has not moved yet, and this is why:** migrations reach the one
shared production database immediately, but code does not. `GET
/companies/Accenture` still measures 817/822/848/436ms warm (4,421ms cold)
because the deployed code still calls `.ilike()`, and an index cannot serve a
query that does not name its expression. The endpoint number is expected to fall
when `Develop` deploys; it is not claimed here.

### What this says about the feed precompute (R2)

R2 was scoped on the assumption that the feed's ~550ms was dominated by
recomputing `_fit_scores` per request. The ranking above does not support that —
no feed query appears near the top by total time, and the feed's DB work is far
below its endpoint time, which is playbook trap 3 (sequential round trips), not
query cost. **R2 is not cancelled, but it is no longer justified by this
measurement.** Section 12 adds the instrumentation it needs.

---

## 12. The feed was unmeasurable, and that is why R2 was guesswork (2026-08-13)

`/jobs/feed` fell through every existing instrument:

- `request_timing` fires `metric route.slow` only above **1000ms**. The feed
  measures ~550ms warm, so it never logged.
- `concurrent_reads` emits `metric fanout.slow` above 250ms — but the feed
  prelude never went through `run_concurrently`. It used a raw per-request
  `ThreadPoolExecutor`, so there was no fan-out line to grep, no section count
  against the read contract, and it sat outside the one process-wide pool that
  exists so a burst cannot multiply threads by requests × sections against the
  40-read bulkhead.

So the endpoint that R2 was designed to speed up had **no per-stage number
anywhere**, and R2's premise was never checked against one.

### The missing primitive

`app/services/phase_timing.py`. The two existing primitives cover the ends and
miss the middle: one number per request, or a breakdown of a CONCURRENT wave
where wall time is `max(section)` and every non-max section is free. An endpoint
running stages IN SEQUENCE has wall time `sum(phase)`, so every phase is worth
its own number — the opposite shape.

Emits one `metric phases.slow label=… total=… slowest=…` line at the same 250ms
threshold, sorted slowest-first, and reports **`unattributed`**: time inside the
block that no phase claimed. That line is the point. Four phases summing to
200ms of a 550ms request means the answer is in the 350ms nobody measured, and a
breakdown without it reads as complete — which is precisely how R2 got scoped.

`/jobs/feed` is timed across `prelude`, `query`, `search_log`, `evals`, `rank`,
`serialize`. The prelude also moved onto `run_concurrently` (label
`jobs.feed.prelude`). In production that is 0-2 sections — `get_feed_context()`
collapses the six-read compat path into one RPC — so the move is about
visibility and the shared pool, not width.

### R2 is blocked on data, deliberately

No conclusion is drawn here. Before any precompute is built, `metric phases.slow
label=jobs.feed` needs **10+ samples from prod** (playbook step 5: which member
is slowest varies between samples, and one sample is an anecdote). Two outcomes
are worth naming in advance:

- If `unattributed` dominates, the cost is not in any stage listed — it is
  serialization, middleware, or connection setup, and a precomputed ranking
  would not move it at all.
- If a slowest-phase that **changes every sample** appears, that is contention,
  not a slow query (playbook step 5) — and the answer is the paid compute gate
  in section 8, not application code.

Either outcome would make R2 the wrong build. That is the entire reason for
measuring first.

---

## 13. Visible Market rails finish automatically (2026-08-14)

The locked product behaviour is now explicit: prioritised loading means
**ordered automatic completion**, not optional loading. Every item visibly
present on Jobs must either hold its real data or show its real-shape loading
state while waiting for its turn. No click, scroll, pointer event, keypress, or
browser-idle callback is allowed to start a required visible item.

The regression came from `3799e114`: the left `MissionHeroRail`, company
signals, and target-role counts shared `useIntentWave()`. That hook listened to
page-wide scroll/pointer/key events, so clicking an unrelated control started
the reads. Before the event the left rail was not mounted at all and disabled
right-rail queries reported `loading=false`; priority had become omission.

Jobs now advances from real query completion in this order:

1. J0 profile + first `/jobs/feed` result (success or degraded error state).
2. Left personalised rail through its existing `/home/bootstrap` BFF and leaf
   fallback contract.
3. Tier-0 Skill Demand snapshot and its covered-city index.
4. Tier-0 Company Signals (`/jobs/companies-at`).
5. Per-target-role chip counts (`/jobs/analytics/me`); mobile, which has no
   desktop rails, starts these after profile resolution.

Each stage latches for the current auth token and opens the next only when its
queries succeed or fail, so one degraded item cannot strand the rest of the
page. Waiting left and right rail items stay mounted as `HeroLoading`,
`SkillDemandLoading`, and `MarketRailLoading`. The obsolete idle/interaction
wave hook was deleted. `market-browse-contract.test.ts` locks the order, the
absence of page-wide interaction gates, and the waiting skeletons.

This changes scheduling, not database work, payloads, or endpoints. The code
contract is verified; no live authenticated waterfall or latency movement is
claimed until the Develop deployment is exercised in a browser.

---

## 14. Onboarding latency slices (2026-08-15)

Software slices that remove wait from Direction → Market and reduce public
saturation. **Paid Supabase compute remains the launch capacity gate** (section 8).

| Slice | Shipped |
|---|---|
| P0.1 Slim confirm-skills | Confirm response skips role-family list; Direction loads families itself |
| P0.2 End First-role wait | Onboarding completes on Direction; land `/market`; no shortlist poll |
| P0.3 Score during skill-review idle | `provisional_baseline_score` after upload; confirm skips recompute when unchanged; excludes force recompute |
| P1 Lighter analysis poll | Stream-first; `/onboarding/result` dead-man poll 45s only while analyzing |
| P2 Public stampede / LLM burst | `Cache-Control` on `/public/stats`; landing `refetchOnMount/Focus=false`; anon score/rewrite burst ceilings |

Do not mark platform capacity green until the paid compute gate in section 8 passes.

---

## 15. Open, measured — the standing latency ledger (2026-08-24)

Sections 7-14 are *closed* work. This one is the **open** list, and it is the
file's live edge: everything below has a number next to it, taken on prod, and
none of it is fixed. Add to it when you measure something; delete a row when it
ships and log the close above.

### Fixed this pass, for context

| | Before | After |
|---|---|---|
| `count_new_jobs_for_user` under RLS | 8,740ms | **100ms / 656 buffers** authed, re-measured 2026-08-25 (migration `20260824090000`, trap 5). The `~15ms` this row used to claim was never taken as `authenticated`. |
| `/preflight/order` (modal open) | 9,062-10,495ms | price split to `/preflight/price` |
| `PATCH /preflight/order/lines/*` | 1,500-4,100ms, 5 hops | 2 hops (~330ms floor) |
| `list_role_families` authed | 2,417ms / 13,440 buffers + 335 temp | **5.99ms** (`20260825100000`, Tier 0 — it was 88% baseline, not trap 5) |
| `indexable_companies` anon | 3,257ms / 13,054 buffers | **1.28ms / 493** (`20260825110000`, Tier 0) |
| `POST /partner/v1/sso/session` retry loop | 170 of 613 alert lines (27.7%) | a re-mint demotes its predecessor instead of destroying it (`20260825120000`) |
| Six pipeline RPCs executable by **`anon`** | queue-drain with no auth | revoked (`20260825130000`) |
| `company_open_roles_page` authed | 6,208ms / 13,070 buffers | **5.4ms / 1,341** (migration `20260825090000`, trap 5) |
| `company_open_roles_page` anon | 3,673ms / 13,068 buffers | **11.0ms / 3,026** — this is the SEO surface |
| `POST /v1/telemetry/cv-upload-phase` | 3,806-4,339ms, 3 sequential hops inline | 202 + `BackgroundTask`; off the response path entirely |
| `/roles/families` request count | 15 per typed query | ~2 — `useDebouncedValue`, 60s `staleTime` |
| Saturation alert sample | `[-8:]` "most recent" — 9 windows were 100% partner SSO | stratified by journey stage, slowest-first inside each |

**Re-measured 2026-08-25 from 11 days of saturation alerts (2026-08-14→24).**
`/home/bootstrap` and `/jobs/matches` did fall, and the fall is **not** this
pass's work:

| | 14 Aug | 17 Aug | 18 Aug | 19 Aug | 20 Aug | 22 Aug | 24 Aug |
|---|---|---|---|---|---|---|---|
| `/home/bootstrap` | 2,273 | **8,405** | 1,986 | 2,251 / 2,196 / 1,523 | 1,867 / 1,609 | 1,161 / 1,324 | 4,807 |
| `/jobs/matches` | 1,559 | **8,416 / 8,214** | 1,937 / 1,571 | 1,819 / 1,645 / 1,786 | 1,497 / 1,457 | 1,172 / 1,441 | — |

Both dropped to 1.2-2.3s on **18 August — six days before migration
`20260824090000`**. The predicted magnitude was right and the attribution was
wrong: do not credit the trap-5 fix with this. The cause of the 18 Aug drop is
still unidentified. The lone 4,807ms on 24 Aug sits inside a correlated
multi-route window (§16), i.e. queueing, not a regression of the fix.

### Open — ranked by what a user feels

| # | Thing | Measured | Suspected cause |
|---|---|---|---|
| 1 | **Read capacity ceiling** | `supabase_read_max_inflight=`**`40`** (`config.py`) — the `12` this row used to name was stale, raised in S5. `/home/bootstrap` fans out to **8**, and its `matches` section fans out again: ~11 concurrent reads from one request against a ≤3 contract. `test_read_contract.py:179` carries the violation as a constant: `{"home.bootstrap": 8, "cv.evidence": 6}`. | Section 8's paid-compute gate — but three §16 fixes **remove** load rather than absorb it. Re-measure the arrival burst after those before buying compute. |
| 2 | `POST /jobs/feed/warm` | **59,854ms** (2026-08-21 07:18) | Unknown. This is also why `feed.unranked` fires: the warm that would rank the feed has not landed when the user reads it. |
| 3 | `/jobs/my-skills/demand` | **17,452ms**, then 11,940ms, then 10,468ms; `aspiration.role_family_failed reason=ReadTimeout fallback_used=true` | Almost certainly trap 5 via `role_family_*` functions. |
| 5 | **15** invoker functions over `public.jobs` reachable by `authenticated` (17 counted 2026-08-25; `list_role_families` and `indexable_companies` are definer now) | 3 measured, all 3 fixed | Trap 5, for the remainder. The **security** half of this row is closed: six pipeline RPCs turned out to be callable by **`anon`**, not just `authenticated` — revoked in `20260825130000`. Sweep query in playbook §4b. |
| 6 | `raw_stack` / `get_user_match_stack` | **~2,494ms** — the new floor under bootstrap and matches | Trap 4 (payload weight) is the standing suspicion: `job_description` was once 59.8% of `/jobs/matches`. Trace consumers before trimming. |
| 7 | Pre-flight order write | 2 hops now, but every answer still rewrites the whole `lines` jsonb | A per-line write (row-per-line, or `jsonb_set`) removes the document rewrite and the CAS for independent lines. |
| 8 | Supabase Free/Nano | **932MB** (2026-08-25; was 1,118MB) against the tier's 500MB recommended; 224MB `shared_buffers`; `work_mem` **2,184kB**; `max_connections` 60 | Section 8. |

### The pattern worth naming

Two of the seven rows above (3, 5) are still the same trap. It was four; the
company page, `list_role_families` and `indexable_companies` have since
shipped — and only one of those three turned out to be **mainly** trap 5. That
is worth holding onto: the trap is real and it is also an easy thing to blame
without measuring. It is a **design** issue rather than a pile of bugs: this codebase reads user-facing data
through the RLS token client, and its hot indexes are PARTIAL on a predicate
the RLS policy only reaches through an `OR`. Every such read pays a heap
recheck.

The cost has a unit. `jobs` is **69,820 rows / 409MB** (100MB heap ≈ 12,800
blocks, 151MB across **43** indexes, ~158MB TOAST). Every RLS-bound "trusted
active jobs" read touches **12,654-13,440 buffers — the entire heap.** The same
call as `service_role` touches 1,337. `shared_buffers` is **224MB**, so one such
call sweeps 45% of the cache and two concurrent evict everything else. That is
the mechanism behind the correlated multi-route windows in §16.

The per-function fix (`security definer` + caller guard) works and is proven.
The larger question is whether the read path should express authorisation once
— a `jobs_public` view over the policy's public branch, with RLS off it, so the
planner sees a single-branch predicate and the partial indexes become reachable
by construction. Cost: one migration plus a mechanical sweep of ~20-30 read call
sites, each needing its result set proved identical. Risk: a reader that should
see a user's own created job gets moved to the public view and silently returns
empty — assert row counts per moved call site for a user who owns one.

---

## 16. The funnel ledger — what the alert channel actually reports (2026-08-25)

Section 15 is the ledger of things *we measured*. This one is the ledger of what
*production reports*, and the two barely overlap. Source: **613 saturation-alert
lines, 2026-08-14 → 2026-08-24**, tallied per route.

The goal this section ranks against is the one in CLAUDE.md — *users understand
the platform and download their CV as smoothly as possible*. A route's place
here is set by where it sits in that journey, not by its milliseconds.

### Where the wait actually falls

| Bucket | Alert lines | Wait summed | Mean |
|---|---|---|---|
| **Stage 1** — landing → signup → upload → onboarding → arrival | 266 | **718s** | 2,698ms |
| **Post-arrival** — feed extras, company pages, applications | 145 | 507s | 3,497ms |
| **Partner SSO** — Finlatics, stage 2 / B2B | **170** | 383s | 2,253ms |

Top routes by how often they trip the 1,000ms alert:

```
170  1002..6670   mean 2253   POST /partner/v1/sso/session
 85  1009..7500   mean 1690   GET  /users/me                  ← every day, all 11
 54  1085..4815   mean 2343   GET  /jobs/feed                 ← every day, all 11
 40  1037..5843   mean 1822   POST /auth/post-signin
 33  1005..5496   mean 1981   GET  /companies/{X}/jobs
 20  1002..8949   mean 1857   GET  /jobs/agent-picks
 16  1251..14730  mean 3906   GET  /jobs/feed-state
 15  4253..9191   mean 7666   GET  /roles/families            ← worst repeated route
 14  2870..9590   mean 6905   GET  /jobs/companies/indexable
 14  2154..4659   mean 3864   POST /cv/upload/finalize        ← never once under 2.1s
  4  8060..15588  mean 12072  GET  /jobs/companies/pulse      ← worst mean on the board
```

**Only one of those has a §15 row.** Section 15 was built from fan-out
instrumentation on the dashboard; the alert channel reports the funnel. That gap
is the finding, not any single route.

### The stage-one journey, end to end

Every route on the actual goal path, with its worst sample in the window:

| Step | Route | Measured |
|---|---|---|
| landing demo | `POST /public/restructure` | **39,710ms** |
| landing demo | `POST /public/rewrite-bullet/variants` | 4,708-13,604ms ×4 |
| landing | `GET /public/stats` | 1,003-**7,833ms** — §8 records this at 1.2ms Tier-0 |
| signup | `POST /auth/post-signin` | 1,037-5,843ms ×40 |
| **upload** | `POST /cv/upload/finalize` | 2,154-4,659ms ×14, **never under 2,154ms** |
| **upload** | `POST /v1/telemetry/cv-upload-phase` | **3,806 / 4,339ms** — telemetry blocking the goal route |
| analysis | `GET /onboarding/result` | 1,284-2,498ms ×5 |
| skills | `POST /onboarding/baseline/confirm-skills` | **13,084ms** |
| direction | `GET /roles/families` | 4,253-9,191ms ×15 |
| arrival | `GET /users/me` | 1,009-7,500ms ×85 |
| arrival | `GET /jobs/feed` | 1,085-4,815ms ×54 |
| CV download | `GET /cv/evidence` | 1,056-**14,746ms** |

`/jobs/feed` is trending **worse**: day-mean ~1,678ms on 14 Aug → ~3,048ms on
24 Aug. Section 8 records it at 477ms p95 and calls that a pass. It has not been
477ms in production on any day in this window. Diagnose before fixing.

### The cache-eviction signature, twice, unprompted

**20 Aug, one window:**

```
GET /jobs/feed-state      14,730ms
GET /cv/evidence          14,746ms
GET /upskilling/activity  14,713ms
GET /jobs/applications    15,964ms
```

**24 Aug, one window:**

```
GET /jobs/contributions            7,235ms
GET /users/me/following/companies  7,287ms
GET /users/me                      7,500ms
GET /jobs/{id}/liveness            7,929ms
GET /jobs/agent-picks              8,949ms
```

Four and five unrelated routes finishing within 33ms and 1.7s of each other.
**Identical durations are a queue, never real work.** The cause is the buffer
arithmetic in §15's pattern note: `/jobs/companies/pulse` (8,060-15,588ms) and
`/jobs/companies/indexable` (2,870-9,590ms) each sweep the whole 100MB `jobs`
heap through a 224MB `shared_buffers`, and everything behind them lands at the
same wall time. 16 Aug shows `pulse` twice back to back at 15,505 and 15,588ms.

### Priority — ordered against the goal, not against milliseconds

**P0 · Make the alert channel show stage one.** — *CLOSED. Sample stratified
`c766a3a8`; the SSO retry loop root-caused and fixed `0bdc8ef5`, and the
second half of that race — a concurrent call un-linking a seat the first one
just linked, which is what actually stranded the 24 — closed in the commit
that carries this line.* 170 of 613 lines are partner
SSO, and the alert prints only the **5 most recent per 120s window** — so on any
window where Finlatics is active, SSO takes all five slots and the stage-one
route that was also slow never reaches the email. Nine windows in this data are
100% SSO. Split the alert by journey stage, and find the retry loop (runs of 4-6
per window, handful of users, returning 200). Nothing below can be verified
while 28% of the signal is one B2B route.

**P1 · `/roles/families`.** — *CLOSED. Debounce `12d7a6eb`, then Tier-0
`fff99f21`: 2,417ms → 5.99ms. Note the ledger had the diagnosis wrong — see
§15's pattern note.* Worst repeated stage-one route, mean 7,666ms, and it
gates Direction — the last step before `/market`. Three fixes in this order:
**debounce the typeahead** (free; 15 requests per query → ~2), then
`security definer`, then the baseline (13,440 buffers, and it spills 335 blocks
to temp because `work_mem` is 2,184kB). §15 row 4 says two fixes; it is three,
and the free one is first.

**P2 · Get telemetry off the CV upload path.** — *shipped `631fde93`.* `POST /v1/telemetry/cv-upload-phase`
blocks 3,806-4,339ms on the single most important request in the product. Make
it fire-and-forget. One change, near-zero risk.

**P3 · Instrument the CV chain before optimising it.** `/cv/upload/finalize` has
never been under 2,154ms in 11 days and has never been decomposed;
`confirm-skills` hit 13,084ms once and was never investigated. Point the
existing `fanout.slow` metric at the funnel. **Rule 0 — do not touch these until
a number exists.**

**P4 · Tier-0 the two public aggregates.** — *`indexable_companies` shipped
`2703ee27` (3,257ms → 1.28ms, 13,054 buffers → 493). `/jobs/companies/pulse`
is still open and is the harder half: `fetch_company_pulse` caches per
REQUESTED COMPANY SET, so every distinct set is its own cold fill, and it
reads every job row for those companies through a PostgREST `.in_()` that
grows with the request. It wants a per-company snapshot so any set is a
lookup.* `/jobs/companies/pulse` and
`/jobs/companies/indexable` are pure aggregates over public data with no
per-user component, and they are what evicts the cache under the funnel.
Snapshot table refreshed on ingest — the `/public/stats` pattern, playbook fix
order #1. This is what removes the correlated windows above. While there: find
out why `/public/stats` itself measures 1,003-7,833ms when §8 records 1.2ms.

**P5 · Hops.** The evidence is in the alerts: `/users/me/xp` twice per load;
`/jobs/{id}/liveness` three times in one window (per-card N+1); one `/market`
arrival paying `/users/me` + `/jobs/feed` + `/jobs/feed-state` +
`/jobs/agent-picks` + `/jobs/pulses` + `/jobs/feed/warm`. §8 locked J0 as
`/users/me` + `/jobs/feed`; it has drifted to six. The hop problem is drift on a
locked contract, not a missing bundle — re-derive J0 before adding one.

**Shipped alongside** `cad90259`: `company_open_roles_page` → `SECURITY
DEFINER`. 6,208ms → **5.4ms** authed, 3,673ms → **11.0ms** anon. Result set
proved identical first — user 33b66361 owns 16 created jobs across 14
companies, and that owner's md5 signatures matched `anon` before the change
and are unchanged after it.

### What not to do

- **Do not buy compute yet.** Section 8's gate is real, but P1, P2 and P4 all
  *remove* load rather than absorb it. Re-run
  `run_read_load_probe.py --scenario market_arrival` after them; the paid-tier
  decision gets cheaper and better evidenced.
- **Do not sweep all 17 invoker functions.** The one-authorisation-seam design
  in §15 is the destination, but none of P0-P3 depend on it.
- **Do not read `pg_stat_statements` totals as current.** `stats_reset` is
  **2026-07-12**; the totals span 43 days and include everything pre-fix. The
  retired company `.ilike()` still ranks #2 cumulatively and took **7 calls in
  11 days**. Rank by call delta, or you will relitigate closed work.

### What shipped 2026-08-25

| | Measured | Commit |
|---|---|---|
| Company page definer | 6,208ms → 5.4ms authed | `cad90259` |
| Telemetry off the CV upload response path | 3,806-4,339ms → off the path | `631fde93` |
| Role typeahead debounced; `useDebouncedValue`, 3 callers | 15 requests → ~2 | `12d7a6eb` |
| Saturation sample stratified by stage, slowest-first | 9 windows were 100% SSO | `c766a3a8` |
| `list_role_families` → Tier-0 snapshot | 2,417ms → 5.99ms | `fff99f21` |
| `indexable_companies` → Tier-0 snapshot | 3,257ms → 1.28ms | `2703ee27` |
| Partner SSO retry loop root-caused | 27.7% of all alert lines | `0bdc8ef5` |
| Six pipeline RPCs revoked from `anon` | queue-drain with no auth | `3d7e46fd` |

**Still open:** CV-chain instrumentation (P3), `/jobs/companies/pulse` (P4's
harder half), the J0 hop re-derivation (P5), and §15 rows 1, 2, 3, 5, 6, 7, 8.

**OWED, outward-facing:** 24 Finlatics seats are stranded in `pending_connect`
with expired tokens. The bug that stranded them is fixed, but they cannot
recover themselves — the partner has to re-issue SSO for those seats.

### Keeping this section true

A row leaves when the alert channel stops reporting it for a full week — not
when a fix ships. That is the distinction §11 got wrong: it closed on a
`service_role` plan, and the route kept alerting for eleven more days.

---

## 17. The 536-alert audit (2026-09-01)

Source: **every saturation alert in the mailbox — 536 messages, 2026-07-23 →
2026-09-01**, parsed rather than sampled. §16 was built from 613 alert *lines*
over 11 days; this is the whole channel over six weeks, so the two agree on
shape and disagree on several specific rows. 2,476 sampled slow requests; the
mail prints at most three per stage, so every count below is a **lower bound**.

### The channel is quieting, and it is not noise

| | alerts/day |
|---|---|
| 2026-07-23 → 08-26 (34 days) | 13.9 |
| 2026-08-26 → 09-01 (7 days) | 9.1 |
| | **−34%** |

Weekly: 63, 102, **131**, 85, 72, 65 — peak in W32, monotonic decline since.

### Rows that earned closure by this file's own rule

*"A row leaves when the alert channel stops reporting it for a full week."*

| Route | Slow samples | p50 | Last alert | Silent |
|---|---|---|---|---|
| `GET /jobs/analytics/skills` | 41 | 4,243ms | 2026-08-05 | 27d |
| `GET /jobs/search/global` | 18 | 8,014ms | 2026-08-07 | 25d |
| `GET /notifications/unread-count` | 56 | 1,873ms | 2026-08-13 | 19d |
| `GET /jobs/analytics` | 43 | 1,186ms | 2026-08-21 | 11d |
| `POST /v1/telemetry/cv-upload-phase` | 6 | — | 2026-08-23 | 9d |
| `GET /jobs/companies/indexable` | **177** | **7,386ms** | 2026-08-25 | 7d |
| `/preflight/*` | 2 | — | 2026-08-16 | 16d |

`indexable_companies` is the cleanest result on the board: 177 slow samples,
**1,302 seconds of summed wait**, stopping dead the day `2703ee27` shipped.
Tier 0 + `SECURITY DEFINER` is the highest-yield move in this file — every
route it was applied to went quiet and stayed quiet.

### Two corrections

**§16 P1 is not closed.** `/roles/families` is marked *CLOSED* on `fff99f21`
(2,417ms → 5.99ms). The alert channel reports it **three more times after
26 August**, up to **8,180ms**, last on **30 August**. The migration is real;
something on that path is not served by it. Re-open and measure the route, not
the function — this is exactly the §11 mistake the file warns about.

**§15 row 3 overstates its route.** `/jobs/my-skills/demand` is recorded at
*17,452ms, then 11,940ms, then 10,468ms*. In 536 alerts it appears **once** —
2026-07-26, at **2,033ms** — and never again. Whatever produced those numbers,
the alert channel has not seen it in 37 days. Re-measure before spending on it.

### What shipped 2026-09-01

| | Measured | Commit |
|---|---|---|
| `/career-skill-path` 19 sequential reads → 11 reads / 5 round trips, max width 3 | p50 5,882ms, max 7,895ms | `f138a5b9` |
| `/jobs/companies/pulse` cached per company, not per requested set | 8,060-**27,409ms** | `d4626bcd` |
| Read-shape guard that counts SEQUENTIAL reads, not just fan-out width | — | `f138a5b9` |

### The finding: the contract only binds code that opted in

`/career-skill-path` shipped `01c14fe2` on **27 August** and was alerting on the
**28th** — one day later, at p50 5,882ms, from **nineteen sequential reads**.
It became the second most frequent alert in the post-fix window.

No guard caught it, and the guards are not weak. `test_read_contract.py` is
thorough about fan-out **width** — but it watches `run_concurrently`, and
`assemble()` never called it. **A route that reads sequentially is invisible to
the entire contract apparatus.** The seam the contract is enforced at only sees
requests that already chose to fan out.

`test_career_skill_path_reads.py` closes it for this route by counting every
round trip through a recording client, asserting depth (≤6 round trips) as well
as width (≤3). The general version — a per-request read counter at the client
seam, so any route exceeding the budget logs `reads.over_budget` the way
`fanout.over_budget` already does — is **open**, and is the thing that would
have caught this on 27 August instead of 1 September.

### Still open

`/users/me` is the most frequent alert in the channel and is getting **worse**
(4.1/day → 6.1/day, p50 1,455 → 1,762ms). It is Tier 1 — a user-scoped point
read, the cheapest thing in the model — and it appears in both cache-eviction
windows in §16. The standing hypothesis is that it is a queue **victim**, not a
cause, which the `pulse` fix above should settle. Do not optimise it until the
next week of alerts says whether it survived that change.

`POST /jobs/feed/warm` still peaks at **59,416ms** (§15 row 2, unchanged).
`/jobs/feed` is alerting more often post-fix (2.4/day → 3.7/day). §15 rows 1,
2, 5, 6, 7, 8 remain open.
