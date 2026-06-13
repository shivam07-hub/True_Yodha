# Career Growth Command Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of the Myro Career Growth Command System: canonical feed truth, durable acquisition attribution, generic growth storage with operator authorization, legacy tracker import, and a private Content/Distribution cockpit.

**Architecture:** FastAPI remains the only privileged database writer. Supabase stores generic growth entities with RLS and no client policies; authenticated operators are allowlisted in `growth_operators` and checked through the service-role client. Next.js captures acquisition locally before auth, submits it to FastAPI after signup, and renders `/admin/growth` through the typed API client and TanStack Query.

**Tech Stack:** FastAPI, Pydantic, Supabase/PostgreSQL, Next.js 14 App Router, React 18, TanStack Query, Tailwind/CSS, Node test runner, pytest.

**Visual reference:** `docs/mockups/growth-command-concept.png`

---

## File Structure

- `frontend/lib/attribution.ts`: capture, retain, append, and clear UTM acquisition data.
- `frontend/components/attribution-capture.tsx`: global browser capture mount.
- `backend/app/services/growth_attribution.py`: normalize and persist first/latest acquisition touches.
- `backend/app/schemas/growth.py`: generic growth, operator, import, and mutation contracts.
- `backend/app/repositories/growth.py`: service-role persistence for assets, campaigns, messages, publications, and imports.
- `backend/app/routers/growth.py`: operator-protected Growth Command API.
- `frontend/components/growth/*`: focused command-center shell, table, filters, and review drawer.
- `scripts/import-growth-tracker.ts`: parse the legacy HTML tracker and send an idempotent import.

### Task 1: Canonical Newsletter Feed

**Files:**
- Create: `frontend/tests/newsletter-feed-domain.test.ts`
- Modify: `scripts/newsletter-feed.ts`
- Regenerate: `frontend/public/newsletter/rss.xml`
- Regenerate: `frontend/public/newsletter/feed.json`

- [ ] Write a failing source contract asserting `BASE = "https://www.himyro.com"` and rejecting `truemirror.vercel.app`.
- [ ] Run `cd frontend && npx tsx --test tests/newsletter-feed-domain.test.ts`; expect failure on the legacy domain.
- [ ] Change only the feed base constant:

```ts
const BASE = "https://www.himyro.com"
```

- [ ] Run `cd frontend && npm run newsletter:feed`.
- [ ] Re-run the focused test and `npm run newsletter:check`; expect both to pass.
- [ ] Commit: `fix(newsletter): use canonical feed domain`.

### Task 2: Acquisition Attribution Through Signup

**Files:**
- Create: `frontend/lib/attribution.ts`
- Create: `frontend/components/attribution-capture.tsx`
- Create: `frontend/tests/attribution.test.ts`
- Create: `backend/app/services/growth_attribution.py`
- Create: `backend/tests/test_growth_attribution.py`
- Modify: `frontend/components/providers.tsx`
- Modify: `frontend/components/auth/signup-form.tsx`
- Modify: `frontend/components/auth/login-form.tsx`
- Modify: `frontend/app/auth/callback/page.tsx`
- Modify: `frontend/lib/api.ts`
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/routers/auth.py`

- [ ] Write frontend failing tests for accepted UTM keys, 30-day expiry, first-touch preservation, latest-touch replacement, and callback URL propagation.
- [ ] Run `cd frontend && npx tsx --test tests/attribution.test.ts`; expect module-not-found failure.
- [ ] Implement the storage contract:

```ts
export interface AcquisitionTouch {
  source: string
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  landingPath: string
  capturedAt: string
}
export interface AcquisitionAttribution {
  first: AcquisitionTouch
  latest: AcquisitionTouch
}
```

- [ ] Mount `<AttributionCapture />` once inside `Providers`, capture on auth entry, and append current attribution to OAuth/magic-link callback URLs.
- [ ] Extend `PostSigninRequestBody`, password signup, and callback post-signin bodies with `attribution` and `is_new_signup`.
- [ ] Write backend failing tests proving first touch is insert-once, latest touch is upserted, malformed sources are dropped, and existing-user login does not create acquisition rows.
- [ ] Run `.venv/bin/pytest backend/tests/test_growth_attribution.py -v`; expect import/attribute failures.
- [ ] Implement `record_signup_attribution(user_id, attribution)` using `growth_attribution_touchpoints`, with `touch_kind IN ('first','latest')`.
- [ ] Call it only for confirmed new signups; attribution failure must log and leave authentication successful.
- [ ] Run focused frontend/backend tests, then existing auth/referral tests.
- [ ] Commit: `feat(growth): persist signup attribution`.

### Task 3: Generic Growth Schema And Operator API

**Files:**
- Create: `database/migrations/20260613_growth_command_phase1.sql`
- Create: `backend/app/schemas/growth.py`
- Create: `backend/app/repositories/growth.py`
- Create: `backend/app/routers/growth.py`
- Create: `backend/tests/test_growth_repository.py`
- Create: `backend/tests/test_growth_router.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_database_migrations.py`

- [ ] Write migration contract tests requiring `growth_operators`, `growth_content_assets`, `growth_campaigns`, `growth_messages`, `growth_publications`, and `growth_attribution_touchpoints`; require RLS on every table and no public policies.
- [ ] Run the migration test; expect missing-file failure.
- [ ] Create the migration with UUID keys, timestamp columns, status checks, archival fields, idempotent unique keys, indexes, foreign keys, RLS, comments, and `NOTIFY pgrst`.
- [ ] Write repository tests for bootstrap listing, message edit, approval, mark-published, and idempotent asset/campaign creation.
- [ ] Implement `GrowthRepository` with focused methods:

```python
def list_command_center(self) -> dict[str, object]: ...
def update_message(self, message_id: str, body: GrowthMessageUpdate) -> dict[str, object]: ...
def approve_message(self, message_id: str, operator_id: str) -> dict[str, object]: ...
def mark_published(self, message_id: str, body: PublicationCreate) -> dict[str, object]: ...
def import_legacy(self, body: LegacyGrowthImport) -> LegacyGrowthImportResult: ...
```

- [ ] Write router tests proving missing JWT returns 401, non-operator returns 403, inactive operator returns 403, and an active operator can read/mutate.
- [ ] Implement `get_growth_operator` by querying `growth_operators` with the service-role client using `principal.id`; never authorize from `user_metadata`.
- [ ] Add `/growth/bootstrap`, `PATCH /growth/messages/{id}`, `POST /growth/messages/{id}/approve`, `POST /growth/messages/{id}/publish`, and `POST /growth/import/legacy`.
- [ ] Run focused repository/router/migration tests.
- [ ] Commit: `feat(growth): add command center backend`.

### Task 4: Newsletter Compatibility And Legacy Tracker Import

**Files:**
- Modify: `backend/app/repositories/newsletter_distribution.py`
- Modify: `backend/tests/test_newsletter_distribution_repository.py`
- Create: `scripts/import-growth-tracker.ts`
- Create: `frontend/tests/growth-tracker-import.test.ts`
- Modify: `frontend/package.json`

- [ ] Rewrite newsletter repository tests to expect generic growth tables while preserving the existing newsletter API response.
- [ ] Run the focused repository tests; expect failures on old table names.
- [ ] Adapt `NewsletterDistributionRepository` to create a newsletter `growth_content_assets` row, campaign, messages, outreach contacts, and queue rows through the generic schema.
- [ ] Write parser tests using a small HTML fixture containing `POSTINGS`, `ISSUES`, and localStorage overrides.
- [ ] Implement balanced-array extraction, status normalization, canonical URL recovery, and import payload generation without executing tracker DOM code.
- [ ] Add `npm run growth:import-tracker -- --dry-run` and require `MYRO_GROWTH_ACCESS_TOKEN` only for live import.
- [ ] Run parser and newsletter compatibility tests; verify dry-run reports non-zero assets/messages and no writes.
- [ ] Commit: `refactor(growth): migrate newsletter distribution model`.

### Task 5: Private Growth Command Cockpit

**Files:**
- Create: `frontend/app/admin/growth/page.tsx`
- Create: `frontend/app/admin/growth/growth-command.css`
- Create: `frontend/components/growth/growth-command.tsx`
- Create: `frontend/components/growth/growth-table.tsx`
- Create: `frontend/components/growth/growth-review-drawer.tsx`
- Create: `frontend/components/growth/growth-filters.tsx`
- Create: `frontend/tests/growth-command.test.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/query-keys.ts`

- [ ] Write failing source/UI contract tests requiring `/admin/growth`, TanStack Query, semantic table controls, draft editing, approve/publish actions, and no client-side admin token.
- [ ] Add typed API contracts for bootstrap, message update, approval, and publication; all calls use bearer auth from the session adapter.
- [ ] Implement the concept's light command surface: 220px nav rail, Today priority row, compact truth metrics, dominant distribution table, and right review drawer.
- [ ] Preserve tracker parity: platform/status/type filters, draft/final copy, canonical and live URLs, composer action, approval status, and publication capture.
- [ ] Use semantic buttons, labels, table markup, visible focus, `aria-live` mutation feedback, and a 375px drawer-first mobile layout.
- [ ] Run `npx tsx --test tests/growth-command.test.ts`, `npx tsc --noEmit`, and `npx next lint`.
- [ ] Start the frontend and verify `/admin/growth` in Browser at desktop and 375px. Capture the latest screenshot and compare it with `docs/mockups/growth-command-concept.png` using `view_image`.
- [ ] Commit: `feat(growth): add private command cockpit`.

### Task 6: Phase 1 Verification And Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-06-13-myro-career-growth-command-system-design.md`
- Modify: `AGENTS.md`

- [ ] Run `.venv/bin/pytest backend/tests`.
- [ ] Run `cd frontend && npx tsx --test tests/*.test.ts`.
- [ ] Run `cd frontend && npm run test:contracts`.
- [ ] Run `cd frontend && npm run newsletter:check`.
- [ ] Run `cd frontend && npx tsc --noEmit && npx next lint && npm run build`.
- [ ] Verify migration SQL with Supabase security guidance: RLS enabled, no browser service key, operator authorization server-side, and no user-metadata authorization.
- [ ] Record exact test results, migration/deployment state, operator bootstrap requirement, and remaining Phase 2 work in `AGENTS.md`.
- [ ] Commit: `docs(growth): record phase 1 completion`.
