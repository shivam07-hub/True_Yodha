# Spec - Job Intelligence And Feed Freshness

**Date:** 2026-06-13
**Status:** Approved for backend implementation
**Owner:** Shivam
**Branch:** `Develop`
---

## Decision

Myro will build one deep **Job Intelligence** module that gives web and future
native clients three stable capabilities:

1. detect a newly published jobs feed cheaply;
2. record structured user feedback without conflating preference with truth;
3. read a privacy-safe Job Pulse for a batch of job cards.

Personalized LLM ranking remains the existing XP-charged Job Refresh. Feed
publication detection is automatic and free.

## Why
The current system loses important meaning:

- `jobs.last_seen` is scraper observation time, but the dashboard treats it as
  database publication time;
- dashboard matches omit lifecycle fields that already exist on market jobs;
- Skip is stored as a durable dismissal without a reason;
- inactive reports, scraper freshness, and application outcomes live in
  unrelated paths;
- five raw reports can deactivate a listing and each report earns immediate XP,
  creating an abuse incentive;
- exact community outcome counts have no shared privacy rule.

The result is a dashboard that cannot reliably say whether new data arrived,
why a job disappeared, or what the community signal means.

## Approaches Considered
### A. Add fields and methods to `JobsRepository`

Rejected. The repository already owns matching, applications, analytics,
market feeds, locations, and imports. More methods would be shallow: every
router would still need to know confidence and privacy rules.

### B. Build a standing realtime stream

Rejected for the 10,000-user stage. Always-on sockets, fan-out, reconnect
semantics, and cross-instance publication invalidation add cost without a
product need. Conditional polling every five minutes is bounded and honest.

### C. Deep Job Intelligence module

Approved. A small interface hides publication clocks, feedback validation,
idempotency, snapshot maintenance, confidence policy, and privacy suppression.

## Large-Feed Design Pattern

Myro adopts the useful pattern, not the hyperscale machinery:

- one platform-neutral JSON contract for web and mobile;
- fast base job objects first, batched social context second;
- stable object IDs and idempotent writes;
- conditional requests and near-data caching;
- append-only feedback facts feeding a read-optimized snapshot;
- eventual consistency for community counters;
- optimistic client actions with server reconciliation.

LinkedIn has described stateless data-model interfaces and keeping caches close
to their data stores. Twitter described its web client consuming the same
interfaces as mobile clients, with client-side caching, and later described
read-optimized timeline caches. Myro applies those principles at Postgres scale
without introducing Kafka, fan-out fleets, or bespoke cache clusters.

## Domain Model

### Feed Publication

The latest successful `job_feed_run_audits` row is the publication clock.

- `feed_version` = audit `run_id`
- `published_at` = audit `created_at`
- `imported_job_count` = audit `total_rows`
- `latest_batch_date` = informational maximum jobs marker

Only `status = 'ok'` advances the version. `jobs.last_seen` remains listing
evidence and is never used as the publication timestamp.

### Job Feedback

`job_feedback_events` is append-only.

```text
personal:
  not_my_role | location | seniority | compensation | company
  skills_gap | already_applied

quality:
  looks_old | apply_link_closed | duplicate | details_wrong
  posting_inactive
```

Every write carries a client-generated UUID. Repeating the same UUID returns
the original event instead of creating another signal.

Personal feedback trains future ranking and exclusion logic. It never changes
global listing confidence. Quality feedback contributes only according to the
confidence policy.

### Job Pulse

Job Pulse combines the canonical `jobs` row with
`job_intelligence_snapshots`:

```text
first_seen_at
last_verified_at
listing_confidence
is_stale
tracking_count
outcomes_shared
ghosted_count
response_signal
quality_report_count
```

Counts below the privacy cohort threshold are returned as `null`. The backend
uses a threshold of five contributors. Clients render "Limited outcome data"
rather than zero.

## Listing Confidence

The initial deterministic policy is intentionally understandable:

```text
closed:
  jobs.is_active = false

likely_closed:
  at least 2 distinct apply_link_closed/posting_inactive reports
  OR stale > 45 days plus at least 2 looks_old reports

uncertain:
  stale > 21 days
  OR at least 1 apply_link_closed/posting_inactive report
  OR at least 2 looks_old reports

active:
  otherwise
```

A single report cannot close a listing. Duplicate and details-wrong reports are
quality signals but do not imply closure. Future apply-link verification can
enter this policy as stronger evidence without changing callers.

## Application Outcomes

`job_applications` stays canonical.

- tracking = `saved | applied | screening | interviewing | final_round`
- applied = every status after `saved`, excluding `withdrew`
- responded = `screening | interviewing | final_round | rejected | offer`
- ghosted = explicit `ghosted`
- interviewed = `interviewing | final_round | offer`
- offer = `offer`

Ghosting is never inferred from a skip or from elapsed time alone.

## Storage

### `job_feedback_events`

- append-only facts;
- RLS insert/select limited to the owning user;
- no browser access to other users' events;
- unique `(user_id, client_event_id)`;
- indexed by `(job_id, feedback_kind, reason_code)`.

### `job_intelligence_snapshots`

- one row per job with community counters;
- no browser policies or grants;
- maintained by database triggers after application or feedback changes;
- reads are backend-only through the service-role adapter;
- rows exist only for jobs with community activity; absent rows mean zero.

The trigger recomputes one affected job from canonical rows. This trades modest
write work for constant-time card reads and is appropriate for 10,000 users.

## HTTP Interface

### `GET /jobs/feed-state`

Authenticated. Returns `200` with Feed State and `ETag`, or `304` when
`If-None-Match` matches the current Feed Version.

Headers:

```text
Cache-Control: private, max-age=0, must-revalidate
ETag: "feed-<run_id>"
```

### `POST /jobs/feedback`

Authenticated and idempotent.

```json
{
  "client_event_id": "uuid",
  "job_id": "text",
  "feedback_kind": "personal",
  "reason_code": "not_my_role",
  "surface": "dashboard"
}
```

Returns the persisted event and whether it was newly created.

The legacy `POST /jobs/{job_id}/report` remains deploy-window compatible but
records `quality/posting_inactive` through Job Intelligence and awards no raw
report XP.

### `POST /jobs/pulses`

Authenticated batch read. Accepts 1-100 unique job IDs and returns pulses in
the requested order. This is separate from the base feed so web and mobile can
paint cards first and lazy-hydrate community context.

## Dashboard Match Contract

`JobMatchResponse` gains:

```text
first_seen
last_seen_at
is_stale
is_active
```

The match repository must select those fields from `jobs`. This closes the
existing lifecycle-field drop without coupling Job Pulse into match compute.

## Client Refresh Contract

Clients should:

1. fetch base dashboard data normally;
2. check Feed State on focus, reconnect, and every five visible minutes;
3. use conditional requests;
4. invalidate live market queries when Feed Version advances;
5. compare `published_at` with `matches_computed_at`;
6. offer Job Refresh when personalized matches predate the Feed Publication;
7. never auto-charge XP.

Web and native clients share these semantics. Presentation and navigation remain
platform-specific adapters.

## Abuse And Privacy

- no immediate XP for raw reports;
- one idempotent event per client action;
- one user can submit multiple distinct reasons, but each counts once per
  reason in the snapshot;
- exact tracking and outcome counts require five contributors;
- no user identities or notes appear in Job Pulse;
- quality reports are rate-limited at the router;
- report verification and trust weighting are future internal policy changes.

## Scale Posture

At 10,000 users:

- Feed State is cached per backend process for 60 seconds and conditionally
  fetched by clients every five minutes;
- Job Pulse is a batch read of at most 100 indexed snapshot rows;
- community aggregates are computed on writes, not on every card read;
- no N+1 requests are required;
- no standing connections are required;
- Postgres remains the source of truth.

Introduce a distributed cache or event stream only when measured database or
cross-instance invalidation pressure justifies it.

## Rollout

1. Ship migration and backend with compatibility route.
2. Backfill snapshots for existing applications and reports.
3. Claude builds dashboard and market adapters from the handoff.
4. Observe feedback completion, report precision, pulse latency, and snapshot
   drift.
5. Retire the legacy `job_reports` table after one stable release.

## Success Criteria

- a newly loaded batch is detected from publication time;
- dashboard matches expose scraper lifecycle fields;
- personal skips cannot make a job globally stale;
- one report cannot close a job;
- community counts respect the cohort threshold;
- Feed State and Job Pulse remain bounded batch reads;
- all new behavior is covered through the Job Intelligence interface.
