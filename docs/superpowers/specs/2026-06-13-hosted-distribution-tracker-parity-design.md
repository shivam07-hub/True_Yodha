# Hosted Distribution Tracker Parity Design

**Date:** 2026-06-13
**Status:** Approved direction; written parity contract
**Owner:** Shivam
**Reference:** `Myro Newsletter/growth-agent/distribution-tracker.html`
**Route:** `/admin/growth`

---

## Decision

The local Distribution Tracker is the behavioral and visual contract for the
hosted Growth dashboard. The hosted product must preserve its proven workflow
before adding broader Growth Command concepts.

The migration replaces browser-local persistence with a secure backend. It does
not replace the tracker's information architecture, density, or operating loop.

## Core Operating Loop

For every prepared posting or community response, Shivam must be able to:

1. Find the item by platform, status, or type.
2. Expand the row without leaving the pipeline.
3. Open the exact platform composer or source thread.
4. Open the linked Myro issue when one exists.
5. Copy the prepared draft.
6. Tweak the draft in context using his own judgement and voice.
7. Publish manually.
8. Paste the exact final version into **What actually went out**.
9. Mark the item posted and capture its live URL.
10. Add impressions and clicks as they become available.
11. Preserve the prepared draft, edited working draft, exact published copy,
    channel context, and performance together for future voice learning.

This is a human-in-the-loop publishing and voice-learning workstation. It is
not primarily an approval queue.

## Information Architecture

The hosted page retains the tracker's three top-level workspaces.

### Postings Pipeline

- Platform, status, and type filters.
- Snapshot export and import.
- KPIs for total, draft, posted, paused, and clicks logged.
- Items-by-platform bar chart.
- Pipeline-by-status doughnut chart.
- Dense table with date, platform, type/campaign, title, status, impressions,
  clicks, and action.
- Expandable working row containing:
  - Open platform composer or source thread.
  - Open linked Myro source.
  - Copy draft.
  - Editable working draft with visible save state.
  - Exact final published copy.
  - Live URL.
  - Publish/status action.

The hosted version may improve control clarity and accessibility, but it must
not convert the table workflow into cards, a review drawer, or a separate
multi-step approval process.

### Newsletter Issues

- Show every imported published or drafted issue.
- Preserve issue number, title, slug, short evidence summary, publication
  status, and canonical URL.
- Open the issue on `himyro.com`.
- Make the issue available as source context to linked pipeline rows.

### Seeding Sweeps

- Show every imported sweep by date and summary.
- Open the complete sweep content inside the dashboard.
- Preserve target thread/search URLs, opportunity rationale, Myro angle,
  suggested response, tone checks, and posting reminders.
- Allow a sweep opportunity to become a pipeline item without copying content
  between unrelated tools.

## Hosted Improvements

### Durable Backend State

- Supabase is the operational source of truth.
- FastAPI uses the service role; browser code receives no service-role key.
- Every dashboard endpoint validates the signed-in user against
  `growth_operators`.
- `shivam.mit20@gmail.com` remains the first active owner.
- Autosaves work across browsers and devices.
- Save failures are shown beside the edited field and never presented as
  success.

### Voice-Learning Record

The system preserves:

- generated or prepared draft,
- Shivam's latest working edit,
- exact final published copy,
- platform and format,
- source issue or sweep,
- campaign and UTM identity,
- live URL and publication timestamp,
- impressions and clicks.

Publication stores an immutable final-copy snapshot. Later edits to a future
draft must not rewrite what was historically posted.

Phase 1 exposes this corpus for review/export. It does not automatically train
or fine-tune a model. Any training step requires a separate consented design
covering data selection, quality controls, deletion, and model/provider choice.

### Recovery And Portability

- JSON export remains available as disaster recovery.
- JSON import accepts the original tracker's override snapshot.
- The one-time legacy importer must ingest `POSTINGS`, `ISSUES`, `SWEEPS`, and
  `SWEEP_CONTENT`, including edited drafts, exact posted copy, status,
  impressions, clicks, and live URLs.
- Import is idempotent through stable legacy identifiers.

## Data Contract

Existing generic growth records remain:

- `growth_content_assets`
- `growth_campaigns`
- `growth_messages`
- `growth_publications`
- `growth_operators`

Required parity additions:

- `growth_seeding_sweeps` for full sweep documents and summaries.
- `growth_publications.final_copy_snapshot` for immutable published voice.
- Publication outcome updates for impressions and clicks.

`growth_messages.draft_copy` stores the prepared baseline. The latest human
working edit and the exact published version remain distinguishable; neither
may silently overwrite the other.

## Visual Contract

The accepted reference is the original local tracker:

- light slate page background,
- blue command header,
- horizontal Pipeline / Newsletter Issues / Seeding Sweeps tabs,
- compact filters and utility buttons,
- five KPI blocks,
- two operational charts,
- dense desktop-first table,
- inline expanded work area,
- clear platform and status colors.

The hosted implementation may refine spacing, typography, focus states, and
mobile behavior using Myro tokens. It must remain recognizably the same tool.

## Automation Boundary

Daily automation may create new drafts and sweep opportunities in the backend,
but it must not publish trust-sensitive content automatically.

The dashboard remains the human checkpoint:

```text
source evidence or sweep
  -> prepared channel draft
  -> Shivam opens context
  -> copies and tweaks
  -> publishes manually
  -> records exact final copy and metrics
  -> future drafts learn from the corpus
```

## Error Handling

- Missing authorization returns a backend `403`.
- Missing source or composer URL disables only that action.
- Failed autosave retains unsaved text and offers retry.
- A publication cannot be recorded without final copy and a live URL.
- Invalid imported snapshots report the rejected record and leave existing
  state unchanged.
- Missing metrics remain blank, never synthetic zeroes.

## Testing

- Import tests cover all four legacy datasets and override fields.
- API tests cover operator authorization, autosave, publication snapshots, and
  metric updates.
- Frontend tests assert all three workspaces and every core row action.
- Browser QA executes the complete draft-to-final loop on desktop and 375px.
- Visual QA compares the hosted implementation against the original tracker's
  layout and workflow.

## Acceptance Criteria

1. Shivam can perform the original workflow without consulting the local file.
2. Pipeline, Issues, and Sweeps are all present and populated.
3. A row can be expanded, copied, edited, published, and measured in place.
4. Prepared draft and exact final copy remain separately queryable.
5. Publication captures an immutable final-copy snapshot.
6. Existing tracker snapshots import without losing edits or metrics.
7. State survives browser and device changes.
8. Only active backend-authorized operators can read or mutate the dashboard.
9. The hosted page is recognizably the original tracker with stronger
   persistence and recovery, not a replacement workflow.
10. The captured corpus is suitable for a later, separately approved
    channel-specific voice-learning system.
