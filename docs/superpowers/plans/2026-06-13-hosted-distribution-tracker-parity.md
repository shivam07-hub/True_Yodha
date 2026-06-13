# Hosted Distribution Tracker Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/growth` as a backend-persisted, faithful version of the proven local Distribution Tracker, including its Pipeline, Newsletter Issues, Seeding Sweeps, and draft-to-final voice-learning loop.

**Architecture:** Extend the existing private Growth API and generic Supabase model instead of creating a second admin system. Add one sweep table and immutable publication-copy snapshots, import all four legacy tracker datasets with stable IDs, then replace the drawer-oriented frontend with the original tabbed, dense inline workflow using TanStack Query and Recharts.

**Tech Stack:** FastAPI, Pydantic, Supabase/PostgreSQL, Next.js 14 App Router, React 18, TanStack Query, Recharts, TypeScript, scoped CSS.

---

## File Structure

### Backend and database

- Modify `database/migrations/20260613_growth_command_phase1.sql`
  - Preserve the canonical fresh-install schema by adding sweep storage and
    immutable final-copy snapshots.
- Create `database/migrations/20260613_growth_tracker_parity.sql`
  - Apply the additive changes safely to the already-migrated live database.
- Modify `backend/app/schemas/growth.py`
  - Add sweep, snapshot, metric-update, and expanded bootstrap/import contracts.
- Modify `backend/app/repositories/growth.py`
  - List sweeps, autosave working copy, capture immutable publication copy, and
    update manual metrics.
- Modify `backend/app/routers/growth.py`
  - Expose authenticated metric update and expanded bootstrap/import behavior.
- Modify `backend/tests/test_database_migrations.py`
- Modify `backend/tests/test_growth_repository.py`
- Modify `backend/tests/test_growth_router.py`

### Legacy import

- Modify `scripts/import-growth-tracker.ts`
  - Parse `POSTINGS`, `ISSUES`, `SWEEPS`, and `SWEEP_CONTENT`.
  - Keep prepared and edited drafts distinguishable.
  - Preserve status, exact final copy, URLs, impressions, and clicks.
- Modify `frontend/tests/growth-tracker-import.test.ts`

### Hosted tracker interface

- Modify `frontend/lib/api.ts`
  - Add sweep and metric types plus API methods.
- Replace `frontend/components/growth/growth-command.tsx`
  - Own tab/filter/expanded-row state and mutations.
- Replace `frontend/components/growth/growth-table.tsx`
  - Render the dense expandable pipeline.
- Replace `frontend/components/growth/growth-filters.tsx`
  - Preserve compact platform/status/type filters and snapshot controls.
- Delete `frontend/components/growth/growth-review-drawer.tsx`
  - The reference workflow is inline, not drawer-based.
- Create `frontend/components/growth/growth-charts.tsx`
- Create `frontend/components/growth/growth-issues.tsx`
- Create `frontend/components/growth/growth-sweeps.tsx`
- Create `frontend/components/growth/growth-snapshot.ts`
- Replace `frontend/app/admin/growth/growth-command.css`
- Modify `frontend/tests/growth-command.test.ts`

### Project record

- Modify `AGENTS.md`
- Modify `docs/superpowers/specs/2026-06-13-hosted-distribution-tracker-parity-design.md`

---

### Task 1: Add Backend Parity Contract

**Files:**
- Modify: `backend/tests/test_database_migrations.py`
- Modify: `backend/tests/test_growth_repository.py`
- Modify: `backend/tests/test_growth_router.py`
- Modify: `database/migrations/20260613_growth_command_phase1.sql`
- Create: `database/migrations/20260613_growth_tracker_parity.sql`
- Modify: `backend/app/schemas/growth.py`
- Modify: `backend/app/repositories/growth.py`
- Modify: `backend/app/routers/growth.py`

- [ ] **Step 1: Write failing migration and repository tests**

Add assertions that:

```python
assert "growth_seeding_sweeps" in sql
assert "final_copy_snapshot text not null" in sql
assert "growth_publications" in metric_update_sql
assert bootstrap["sweeps"][0]["legacy_key"] == "tracker:sweep:2026-06-10"
```

Add a publication test that supplies:

```python
PublicationCreate(
    live_url="https://www.linkedin.com/feed/update/urn:li:activity:1",
    final_copy_snapshot="The exact published words.",
)
```

and verifies the immutable snapshot is inserted with the publication.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
.venv/bin/pytest \
  backend/tests/test_database_migrations.py \
  backend/tests/test_growth_repository.py \
  backend/tests/test_growth_router.py -q
```

Expected: failures for missing sweep table, response field, publication
snapshot, and metric endpoint.

- [ ] **Step 3: Implement the minimal database and API contract**

Add:

```sql
create table if not exists public.growth_seeding_sweeps (
    id uuid primary key default gen_random_uuid(),
    legacy_key text unique,
    sweep_date date not null,
    title text not null,
    summary text,
    body text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.growth_publications
    add column if not exists final_copy_snapshot text;
```

Backfill existing publications from their linked message before making the
column `NOT NULL`. Add Pydantic types:

```python
class GrowthSeedingSweep(BaseModel):
    id: str
    legacy_key: str | None = None
    sweep_date: str
    title: str
    summary: str | None = None
    body: str
    metadata: dict[str, Any] = Field(default_factory=dict)

class GrowthMetricUpdate(BaseModel):
    impressions: int | None = Field(default=None, ge=0)
    clicks: int | None = Field(default=None, ge=0)
```

Require `final_copy_snapshot` on a published `PublicationCreate`. Add:

```text
PATCH /growth/publications/{publication_id}/metrics
```

and include `sweeps` in `/growth/bootstrap`.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: all selected backend tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/growth.py \
  backend/app/repositories/growth.py \
  backend/app/routers/growth.py \
  backend/tests/test_database_migrations.py \
  backend/tests/test_growth_repository.py \
  backend/tests/test_growth_router.py \
  database/migrations/20260613_growth_command_phase1.sql \
  database/migrations/20260613_growth_tracker_parity.sql
git commit -m "feat(growth): add tracker parity backend"
```

### Task 2: Import the Complete Legacy Tracker

**Files:**
- Modify: `frontend/tests/growth-tracker-import.test.ts`
- Modify: `scripts/import-growth-tracker.ts`

- [ ] **Step 1: Write failing import tests**

Extend the fixture with:

```javascript
const SWEEP_CONTENT = {
  "2026-06-10": "# Sweep\n\nFull opportunity context."
};
const SWEEPS = [
  {key:"2026-06-10",date:"2026-06-10",pts:"India-first opportunities"}
];
```

Assert:

```typescript
assert.equal(payload.sweeps.length, 1)
assert.equal(payload.sweeps[0].body, "# Sweep\n\nFull opportunity context.")
assert.equal(payload.messages[0].metadata.prepared_draft, "Original draft")
assert.equal(payload.messages[0].draft_copy, "Edited founder copy")
assert.equal(payload.publications[0].final_copy_snapshot, "Exact live copy")
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd frontend
npx tsx --test tests/growth-tracker-import.test.ts
```

Expected: failure because sweeps and immutable final snapshots are absent.

- [ ] **Step 3: Implement complete deterministic import**

Add a balanced object-literal extractor for `SWEEP_CONTENT`, parse `SWEEPS`,
and return:

```typescript
export interface LegacyGrowthPayload {
  assets: LegacyRow[]
  campaigns: LegacyRow[]
  messages: LegacyRow[]
  publications: LegacyRow[]
  sweeps: LegacyRow[]
}
```

Store the original generated copy in
`growth_messages.metadata.prepared_draft`, the latest edited copy in
`draft_copy`, and the exact posted text in both `final_copy` and
`growth_publications.final_copy_snapshot`.

- [ ] **Step 4: Run import tests and real dry run**

Run:

```bash
cd frontend
npx tsx --test tests/growth-tracker-import.test.ts
npm run growth:import-tracker -- --dry-run
```

Expected: tests pass and the dry run reports four seeding sweeps in addition to
the tracker assets, campaigns, messages, and publications.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-growth-tracker.ts frontend/tests/growth-tracker-import.test.ts
git commit -m "feat(growth): import complete tracker history"
```

### Task 3: Rebuild the Hosted Tracker Interface

**Files:**
- Modify: `frontend/tests/growth-command.test.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/components/growth/growth-command.tsx`
- Modify: `frontend/components/growth/growth-filters.tsx`
- Modify: `frontend/components/growth/growth-table.tsx`
- Delete: `frontend/components/growth/growth-review-drawer.tsx`
- Create: `frontend/components/growth/growth-charts.tsx`
- Create: `frontend/components/growth/growth-issues.tsx`
- Create: `frontend/components/growth/growth-sweeps.tsx`
- Create: `frontend/components/growth/growth-snapshot.ts`
- Modify: `frontend/app/admin/growth/growth-command.css`

- [ ] **Step 1: Replace shallow tests with parity tests**

Assert the implementation contains:

```typescript
assert.match(command, /Postings pipeline/)
assert.match(command, /Newsletter issues/)
assert.match(command, /Seeding sweeps/)
assert.match(table, /What actually went out/)
assert.match(table, /Copy draft/)
assert.match(table, /Open composer/)
assert.match(table, /Impressions/)
assert.match(table, /Clicks/)
assert.match(charts, /BarChart/)
assert.match(charts, /PieChart/)
assert.doesNotMatch(command + table, /GrowthReviewDrawer/)
```

Also assert the mobile CSS retains a scrollable table and an inline stacked
work area instead of a fixed full-screen drawer.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd frontend
npx tsx --test tests/growth-command.test.ts
```

Expected: failures for missing tabs, charts, inline workbench, metrics, and
sweeps.

- [ ] **Step 3: Implement the three-tab shell and parity visuals**

Use the reference labels and hierarchy:

```text
Myro Distribution Tracker
Postings pipeline | Newsletter issues | Seeding sweeps
Total | Draft | Posted | Paused | Clicks logged
```

Use Recharts for the platform bar chart and status doughnut. Preserve the
reference light-slate background, blue header, compact controls, status colors,
dense table, and expandable inline work area.

- [ ] **Step 4: Implement the exact row workflow**

For each row:

```text
Open composer/source
Open Myro source
Copy draft
Edit working draft
Save
Paste exact final copy
Enter live URL
Mark posted
Edit impressions/clicks
```

Use TanStack Query mutations against the existing backend. Retain local text
when a save fails and show the error beside that row. Do not add an approval
step to the reference workflow.

- [ ] **Step 5: Implement snapshot recovery**

Export a JSON document containing current message edits, publication evidence,
and metrics. Import validates the document in-browser and sends the accepted
records through the authenticated legacy import endpoint.

- [ ] **Step 6: Run frontend verification**

Run:

```bash
cd frontend
npx tsx --test tests/growth-command.test.ts tests/growth-tracker-import.test.ts
npx tsc --noEmit
npx next lint
npm run build
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/admin/growth/growth-command.css \
  frontend/components/growth \
  frontend/lib/api.ts \
  frontend/tests/growth-command.test.ts
git commit -m "feat(growth): restore hosted tracker workflow"
```

### Task 4: Apply, Import, And Verify End To End

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-06-13-hosted-distribution-tracker-parity-design.md`

- [ ] **Step 1: Run full repository verification**

Run:

```bash
.venv/bin/pytest backend/tests
cd frontend
npx tsc --noEmit
npx next lint
npm run build
```

Record any unrelated pre-existing failures separately.

- [ ] **Step 2: Apply the additive Supabase migration**

Apply `database/migrations/20260613_growth_tracker_parity.sql` to project
`gipvxuugajkugntwkeiz`, then verify:

```sql
select
  to_regclass('public.growth_seeding_sweeps') is not null as sweeps_exist,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'growth_publications'
      and column_name = 'final_copy_snapshot'
  ) as snapshot_exists;
```

- [ ] **Step 3: Import the tracker through the authenticated backend**

Run:

```bash
cd frontend
MYRO_GROWTH_ACCESS_TOKEN=<operator bearer token> \
  npm run growth:import-tracker
```

Do not bypass the application API with direct content inserts. Verify counts
for assets, campaigns, messages, publications, and sweeps.

- [ ] **Step 4: Browser QA the complete operating loop**

At desktop and 375px:

1. Open `/admin/growth`.
2. Switch through all three tabs.
3. Filter a pipeline row.
4. Expand it.
5. Copy and edit the working draft.
6. Save and reload to prove persistence.
7. Enter final copy and live URL.
8. Mark it posted.
9. Enter impressions and clicks.
10. Reload and confirm all values remain.

Do not publish externally during QA. Use a dedicated test row or rollback-safe
fixture.

- [ ] **Step 5: Visual parity review**

Compare the hosted page against
`Myro Newsletter/growth-agent/distribution-tracker.html` for:

- blue header and horizontal tabs,
- five KPI blocks,
- two charts,
- dense table columns,
- inline row expansion,
- issues grid,
- sweep document reader,
- desktop and mobile overflow behavior.

- [ ] **Step 6: Update project records**

Update the parity specification status and prepend `AGENTS.md` with:

- commits,
- live schema/import counts,
- browser QA evidence,
- test results,
- any intentionally deferred voice-training automation.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md \
  docs/superpowers/specs/2026-06-13-hosted-distribution-tracker-parity-design.md
git commit -m "docs(growth): record hosted tracker parity"
```
