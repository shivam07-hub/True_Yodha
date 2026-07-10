# Trusted Job Lifecycle And Retirement Plan

## Product Direction

Myro should optimize for **verified opportunities, not the largest job count**:
when it asks a candidate to spend time, it has recent evidence that the exact
opportunity can still be pursued.

“Ghost job” must not become an imprecise label. Myro needs three separate terms:

- **Closed listing:** the exact role can no longer be opened or applied to.
- **Ghost-risk posting:** the listing is accessible, but evidence suggests the
  employer may not be actively filling it.
- **Recruitment ghosting:** a candidate applied and received no response.

The first is a listing-lifecycle problem. The second is a later intelligence
problem. The third remains an explicit application outcome. They must never be
collapsed into one database flag.

## Live Audit: Why This Is P0

Read-only Supabase audit on 2026-07-11:

- `jobs`: 52,951 total; 46,187 marked active.
- 33,185 active rows have not been seen in 21 days.
- 17,472 active rows have not been seen in 45 days.
- Only 13,002 marked-active rows are within the current 21-day freshness window.
- 565 active rows have no application URL.
- The latest July 3 corpus has 9,100 jobs across 160 companies, but those same
  companies retain 17,838 older rows as active.
- The existing retirement dry run would allow 6,172 missing rows through the
  current safety guard. It blocks 11,666 rows across 25 companies because more
  than 75% of that company’s apparent inventory disappeared.
- `job_versions` contains zero rows: the importer’s deactivation path has not
  produced an auditable retirement event.

Current user impact:

- 1,540 durable match rows exist across 178 users.
- 683 rows are active-but-stale and 48 are inactive.
- 133 of 178 users have a majority of match rows outside the trusted window.
- 101 users have zero fresh match rows.
- 310 saved/application rows exist; 213 are active-but-stale and 9 inactive.
- 8 of the 11 current Myro Agent Picks are stale by the same rule.
- Only 11 structured job-feedback events exist. No job has two independent
  closure reporters, so community evidence cannot currently retire anything.

Named examples:

- Adarsh currently has 39 durable matches: 15 are older than 21 days, 10 are
  older than 45 days, and one is inactive. Fifteen of his 18 saved jobs are
  outside the trusted window.
- Namitha’s referenced earlier match output cannot be reconstructed from the
  current `user_job_matches` table. Her one saved job was last seen on April 30.
  This exposes a second gap: Myro does not retain an immutable record of what it
  showed a user at the time of exposure.

Direct probes also show why HTTP status alone is insufficient: old Siemens and
Accenture examples returned 404, old Deloitte/EY links redirected to generic
career pages, while some Workday pages returned 200 without server-rendered job
content. Verification must understand each ATS, redirects, and page semantics.

## Root Causes

1. **`is_active` is not trustworthy enough to serve users.** It is a boolean
   shared by importer, community-era logic, and readers without one owner.
2. **Successful import is not the same as complete source coverage.** The global
   feed audit does not say which company/portal was fully enumerated.
3. **Retirement is optional and manual.** The importer only deactivates when a
   special flag is used; recent successful loads did not retire missing rows.
4. **The importer contract is contradictory.** It says `is_active` is excluded
   from conflict updates, but sends `is_active=true` through a normal upsert.
5. **Reads enforce different policies.** New match candidates use freshness,
   durable match stacks do not; Market filters only `is_active`; Agent Picks
   also filter only `is_active`.
6. **User signals are lossy.** “No, it’s gone” is fire-and-forget and errors are
   swallowed. “Yes, it’s live” is not persisted at all.
7. **Negative-only evidence cannot calibrate confidence.** Myro cannot measure
   successful live confirmations or verifier precision.
8. **No exposure ledger exists.** We cannot reliably answer which jobs a user
   saw, which state Myro claimed, or how quickly Myro corrected it.

## Non-Negotiable Invariants

1. Jobs are **soft-retired, never deleted**. Applications, submitted CVs,
   match explanations, and outcome history remain intact.
2. A stale job is hidden from recommendations, not declared closed.
3. A timeout, 403, CAPTCHA, or blocked verifier means **unknown**, never closed.
4. Absence counts only after a successful, complete run for that exact source.
5. One user report protects that user immediately but cannot globally close a job.
6. Listing closure never changes an application outcome to `ghosted`.
7. A job seen live again is explicitly reactivated with an audit event.
8. Users never pay tokens to replace a recommendation invalidated by Myro data.
9. Myro Agent Picks have the strictest verification SLA of every surface.
10. One lifecycle policy decides eligibility for Market, matches, Agent Picks,
    analytics, and notifications.

## Canonical Evidence Model

### 1. Source-run ledger

Add a per-company/per-portal run record rather than relying only on a global
feed audit:

```text
job_source_runs
  id, company_name, source_key, provider, started_at, completed_at,
  status, observed_count, prior_good_count, coverage_ratio, run_marker,
  parser_version, failure_reason
```

Only `complete` runs create absence evidence. A large count collapse makes the
run `partial` or `blocked`; it does not make thousands of jobs closed.

### 2. Append-only listing observations

```text
job_listing_observations
  id, job_id, observed_at, source_run_id?, user_id?, observer,
  result, strength, evidence JSONB, client_event_id?, verifier_version
```

Store normalized evidence only: status, redirect category, provider response,
and hashes where useful. Do not store page HTML or candidate information.

`observer` is scraper, verifier, user, or operator. `result` is `seen_live`,
`apply_live`, `source_missing`, `closed`, `redirected`, `wrong_role`, `blocked`,
`timeout`, or `error`; strength is strong, medium, or weak.

### 3. Materialized current state

Keep `JobPulse.listing_confidence` as the public vocabulary and materialize its
inputs on `jobs` or a one-to-one lifecycle table:

```text
listing_confidence, last_verified_live_at, last_verification_attempt_at,
consecutive_complete_misses, confidence_reason, retired_at, reactivated_at
```

`is_active` remains a compatibility serving switch during migration, but the
Lifecycle service becomes its only writer.

### 4. Recommendation exposure ledger

Add `job_recommendation_exposures(id, user_id, job_id, surface, shown_at,
confidence_at_show, verified_live_at, feed_version, match_id)` with bounded
retention and backend-only aggregate access. This makes Namitha-like incidents
reproducible without storing extra CV or identity data.

## Confidence And Retirement Policy

| Evidence | Result | User-facing eligibility |
|---|---|---|
| Seen in a complete source run | `active` | Eligible |
| Provider-specific job endpoint confirms exact role | `active` | Eligible |
| User confirms exact role was viewable/applyable | Adds live evidence | Eligible if no stronger conflict |
| Past source SLA with no newer evidence | `uncertain` | Hidden from default recommendations |
| One complete-run miss or generic-home redirect | `likely_closed` | Hidden; queued for verification |
| Two complete-run misses at least 24h apart | `closed` | Retired |
| Provider returns explicit removed/filled/not-found | `closed` | Retired immediately |
| One user reports closed | User-protected + priority verify | Not globally retired |
| Two independent reports plus failed direct check | `likely_closed` | Hidden; operator/verifier review |
| Timeout, 403, 429, CAPTCHA, parser error | `uncertain` | Hidden until verified; never closed |

Source SLAs should be configurable. Start with 14 days for Myro Agent Picks and
21 days for ordinary recommendations, then calibrate by provider and measured
job lifetime. `date_posted` is supporting evidence only: just 14,184 active rows
have it, and many values are relative strings such as “Posted 30+ Days Ago.”

## User-Signal Capture And Transfer

Extend Apply Transport without adding a new parallel flow:

1. Ask: “Could you view or apply to this exact role?”
2. Persist both answers:
   - Yes -> `apply_live`
   - No -> `closed`, `redirected`, `wrong_role`, or `technical_error`
3. Give every event a client UUID and return an acknowledged receipt.
4. Put failed events in a small authenticated client outbox and retry on focus,
   reconnect, and next session. Never silently discard them.
5. Treat 4xx validation/rate-limit responses as terminal and observable; retry
   only network/5xx failures.
6. Replace the current three-quality-reports-per-day cap with duplicate control
   and anomaly/rate monitoring. A serious job seeker may inspect more than three
   jobs in a day, and raw reports already earn no reward.
7. Measure acknowledgement rate, retry backlog age, and event-to-snapshot delay.

## Surface Behavior

### Market

- Default results contain only lifecycle-eligible jobs.
- `uncertain`, `likely_closed`, and `closed` do not inflate demand counts.
- A separate, capped “Help Myro verify” queue may expose uncertain jobs, but it
  must never look like the main opportunity feed.

### Personalized matches

- Filter eligibility again at read time; durable rows may outlive the listing.
- Preserve the cached evaluation but archive it from the visible stack.
- Generate a free replacement when Myro retires a recommended job.
- Never send a “fresh match” notification for an unverified job.

### Saved jobs and applications

- Never remove the row from Collections.
- Show the lifecycle change and the last trustworthy evidence.
- Offer replacement roles and preserve the submitted-CV/application timeline.
- Do not infer recruitment ghosting from listing closure.

### Myro Agent Picks

- Require a live observation within 14 days before selection.
- Recheck the exact apply endpoint before publishing a pick when supported.
- Remove and replace a pick automatically when confidence degrades.
- Target 99% verified-live coverage. The Agent is the highest-trust promise.

## Phased Action Plan

### Phase 0 — Stop trust loss (1-2 days)

1. Introduce one shared eligibility predicate and apply it to durable matches,
   Market, Agent Picks, demand analytics, and fresh-match notifications.
2. Hide active rows outside the 21-day window; do not mark them closed yet.
3. Quarantine the 6,172 July-3 missing rows that pass the existing safety guard.
4. Keep the 11,666 rows from 25 blocked companies uncertain and investigate
   source completeness. Never use `--allow-large-deactivation` as a shortcut.
5. Remove stale Agent Picks and generate verified replacements.
6. Refill affected users’ visible match stacks for free.

### Phase 1 — Make lifecycle evidence durable (3-5 days)

1. Add source-run, observation, materialized lifecycle, and exposure tables.
2. Backfill live observations from trustworthy `last_seen` values and existing
   feedback; backfill older rows as `uncertain`, not closed.
3. Give lifecycle writes one backend service and one tested policy function.
4. Add RLS: user observations are own-insert/own-read; lifecycle snapshots and
   exposure aggregates remain backend-only.
5. Repair the importer’s `is_active` ownership and record every retirement and
   reactivation event.

### Phase 2 — Verify automatically (5-8 days)

1. Build provider adapters for Greenhouse, Lever, Workday, Oracle, SAP, and
   generic redirects; do not use a universal HEAD-request verdict.
2. Run verification through the durable Railway worker, prioritized by:
   Agent Picks -> visible matches -> saved jobs -> Market long tail.
3. Record `blocked`/`timeout` separately and use exponential backoff.
4. Turn complete source-run misses into observations and enforce the two-miss rule.

### Phase 3 — Make users reliable witnesses (3-5 days)

1. Persist positive and negative Apply Transport answers.
2. Add the idempotent outbox, receipts, retry telemetry, and recovery tests.
3. Immediately hide a reported-gone job for that reporter and offer a similar job.
4. Feed verified observations into the existing Job Pulse instead of creating a
   second trust badge system.

### Phase 4 — Ghost-risk intelligence (after lifecycle precision is proven)

1. Detect repeated reposts, unusually long open duration, high closed-link rate,
   and privacy-safe response/outcome patterns.
2. Show “ghost risk” as evidence with confidence, never as a factual accusation.
3. Keep company advice separate from listing availability and application outcomes.

## North Star And Guardrails

**North star: Verified-live recommendation rate**

> Percentage of recommendation and Agent-Pick impressions backed by a live
> observation inside that surface’s verification SLA.

Initial targets:

- >=95% for personalized recommendations.
- >=99% for Myro Agent Picks.
- <1% confirmed-dead apply-click rate.
- <15 minutes from strong closure evidence to removal from discovery surfaces.
- >=99.5% acknowledged user-signal writes.
- <1% false-retirement/reactivation rate after calibration.

Report coverage by source and company beside these metrics. A high verified-live
rate achieved by silently shrinking to a tiny corpus is not success; eligible
job count and user-role/location coverage are guardrails.

## Rollout And Verification Gates

1. Shadow-compute lifecycle states without changing reads for 48 hours.
2. Review a stratified sample across each ATS and all 25 blocked companies.
3. Canary the eligibility filter to internal/test users, then 10%, 50%, 100%.
4. Compare dead-end rate, eligible pool depth, match replacement quality, and
   reactivation rate at every step.
5. Add policy matrix tests, Supabase migration/RLS tests, provider fixtures for
   404/redirect/403/timeout/live cases, and full backend/frontend checks.
6. Provide an operator audit view with evidence, state transitions, source-run
   health, and reversible reactivation before automated global retirement.

Approve Phase 0 as the emergency trust boundary and Phase 1 as the durable
foundation. Do **not** bulk-delete jobs or call stale jobs ghost jobs. Myro can
show a smaller, verified feed while it builds evidence for stronger claims.
