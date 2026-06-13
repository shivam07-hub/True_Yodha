# Claude Handoff - Job Intelligence Frontend

**Date:** 2026-06-13  
**Branch:** `Develop`  
## Start Here

Read the canonical design first:

- `docs/superpowers/specs/2026-06-13-job-intelligence-and-feed-freshness-design.md`
- `docs/superpowers/plans/2026-06-13-job-intelligence-backend.md`

Backend commits:

```text
15c5f77 docs: specify job intelligence backend
54d158c feat: add conditional job feed state
36ce2a4 fix: preserve job lifecycle in dashboard matches
d4fcf45 feat: capture structured job feedback
c6cc4af feat: add privacy-safe job pulse
4d6b7ca refactor: deepen job intelligence boundary
```

Do not rewrite the backend contract from frontend assumptions. The backend
module deliberately has three stable capabilities: Feed State, Job Feedback,
and Job Pulse.

## Deployment Gate

The migration exists but was **not applied to live Supabase** because the
Supabase MCP token expired during implementation:

```text
database/migrations/20260613_job_intelligence.sql
```

Before deploying frontend calls:

1. Reauthenticate the Supabase connector.
2. Apply the migration to project `gipvxuugajkugntwkeiz`.
3. Run Supabase security and performance advisors.
4. Verify authenticated insert/select on `job_feedback_events`.
5. Verify service-role select on `job_intelligence_snapshots`.
6. Deploy the `Develop` backend before the frontend.

The migration was syntax-tested on PostgreSQL 17. Authenticated identity
inserts, RLS ownership, sequence grants, snapshot triggers, and service-role
grants were exercised locally.

## API Contracts

### Feed State

```http
GET /jobs/feed-state
Authorization: Bearer <token>
If-None-Match: "feed-<run_id>"
```

`200`:

```json
{
  "feed_version": "run-id-or-null",
  "published_at": "2026-06-13T08:30:00Z",
  "imported_job_count": 17956,
  "latest_batch_date": "2026-06-04"
}
```

Response headers:

```text
ETag: "feed-<run_id>"
Cache-Control: private, max-age=0, must-revalidate
```

An unchanged request returns `304` with no JSON body. The generic
`request<T>()` helper in `frontend/lib/api.ts` assumes JSON success responses,
so implement a dedicated conditional-fetch helper that explicitly handles
`304`.

`published_at` is the successful import time. Never substitute
`jobs.last_seen`, which is scraper observation time.

### Structured Feedback

```http
POST /jobs/feedback
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "client_event_id": "crypto.randomUUID()",
  "job_id": "job-id",
  "feedback_kind": "personal",
  "reason_code": "not_my_role",
  "surface": "dashboard"
}
```

Personal reasons: `not_my_role`, `location`, `seniority`, `compensation`,
`company`, `skills_gap`, `already_applied`.

Quality reasons: `looks_old`, `apply_link_closed`, `duplicate`,
`details_wrong`, `posting_inactive`.

Surfaces: `dashboard`, `market`, `job_detail`, `other`.

Success is `201` for a new event and `200` for an idempotent replay. Preserve
the same `client_event_id` during retries. Quality feedback is capped at three
new reports per user per UTC day and can return `429`. Personal feedback is not
subject to that cap.

The old `POST /jobs/{job_id}/report` route remains temporarily compatible, but
now returns `xp_earned: 0`. New UI should use `/jobs/feedback`.

### Job Pulse

```http
POST /jobs/pulses
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "job_ids": ["job-1", "job-2"]
}
```

The request accepts 1-100 unique, nonblank IDs. The response preserves request
order:

```json
{
  "pulses": [
    {
      "job_id": "job-1",
      "first_seen_at": "2026-06-01",
      "last_verified_at": "2026-06-12",
      "is_stale": false,
      "listing_confidence": "active",
      "tracking_count": 8,
      "outcomes_shared": 5,
      "ghosted_count": 2,
      "response_signal": "high",
      "quality_report_count": null
    }
  ]
}
```

`null` community counts mean the privacy cohort has fewer than five
contributors. They do not mean zero. Render a quiet limited-data state instead
of `0`.

Listing confidence: `active`, `uncertain`, `likely_closed`, `closed`.

Response signal: `low`, `mixed`, `high`, or `null`.

### Dashboard Match Lifecycle

`GET /jobs/matches` now carries:

```text
first_seen: string | null
last_seen_at: string | null
is_stale: boolean
is_active: boolean
```

Use `last_seen_at` for "Last verified" UI. Use `first_seen` only for discovery
age and sorting.

## Frontend Architecture

Keep the network contract shared and the presentation adaptive:

1. Add strict interfaces and API functions in `frontend/lib/api.ts`.
2. Add a small `useFeedState` query wrapper with ETag retained in module memory
   or query metadata.
3. Check Feed State on authenticated dashboard/market mount, window focus,
   browser reconnect, and every five minutes while the page is visible.
4. Do not poll while hidden and do not open a standing realtime connection.
5. When `published_at > matches_computed_at`, invalidate only relevant feed
   queries and show the existing explicit Job Refresh action.
6. Never auto-run or auto-charge the XP-backed personalized refresh.
7. Paint base job cards first, then request pulses once for the visible batch.
8. Keep pulse query keys deterministic and bounded; do not issue one request
   per card.

Recommended query keys:

```text
["jobs", "feed-state"]
["jobs", "pulses", stableVisibleJobIds]
["jobs", "matches"]
["jobs", "market", existingFilters]
```

For web and future native clients, keep API types and reason codes free of DOM,
CSS, and browser-storage assumptions. Web may use focus/reconnect events;
native can later map the same query contract to app foreground and network
events.

## Interaction Loop

Skipping a card should remain immediate:

1. Optimistically remove the card.
2. Keep the existing Undo affordance.
3. Offer an optional compact reason chooser.
4. Send personal reasons without changing global listing trust.
5. Send quality reasons only when the user explicitly identifies a listing
   problem.
6. Restore/reconcile the card if persistence fails.

Do not make reason selection mandatory. The engine learns more when users
answer, but the core action must stay fast.

Suggested labels:

```text
Not my role
Wrong location
Wrong seniority
Compensation
Company preference
Skills gap
Already applied
Looks old
Apply link closed
Duplicate listing
Details are wrong
Posting inactive
```

## Job Card Presentation

The compact trust row should prioritize:

```text
Last verified <relative date>
<tracking_count> tracking
Response signal: <low|mixed|high>
```

Only show values that exist. Use visual confidence state for
`uncertain/likely_closed/closed`; avoid helper copy that restates the same
state. The detail surface can reveal first seen, outcomes shared, ghosted
count, and quality-report count.

At 375px, preserve the job title, company, match signal, and primary action
before community metadata. Pulse hydration must not cause card-height jumps;
reserve a compact row or fade it in without moving the main controls.

## Acceptance Tests

- A matching ETag produces a handled `304`, not a JSON parse error.
- Feed polling pauses while the document is hidden.
- Focus and reconnect trigger one conditional check.
- A newer publication offers refresh but never spends XP automatically.
- Dashboard cards render `last_seen_at` as Last verified.
- A pulse batch contains no more than 100 unique IDs.
- Base cards remain usable while pulses load or fail.
- `null` privacy counts never render as zero.
- Personal feedback cannot be sent with a quality reason.
- Retried feedback reuses the same client UUID.
- A `429` quality cap does not remove or corrupt the card.
- Desktop and 375px mobile layouts have no overflow or action displacement.

## Backend Verification

```text
644 backend tests passed
PostgreSQL 17 migration syntax passed
Authenticated RLS insert and identity sequence passed
Snapshot insert/update/delete triggers passed
```

Run the full frontend checks required by `AGENTS.md` after implementation:

```bash
cd frontend
npx tsc --noEmit
npx next lint
npm run build
```
