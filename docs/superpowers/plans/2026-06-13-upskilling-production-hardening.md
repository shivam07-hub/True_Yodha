# Upskilling Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair and harden the production `/forge` upskilling ladder from Supabase query through frontend rendering and post-deploy verification.

**Architecture:** Preserve the existing FastAPI/TanStack Query flow. Correct the backend taxonomy contract, separate assessed progress from CV-inferred levels, enforce user-scoped reward idempotency in Python and PostgreSQL, expose a retryable frontend error state, and add CI plus authenticated smoke gates.

**Tech Stack:** Python 3.11, FastAPI, supabase-py/PostgREST, PostgreSQL, pytest, Next.js 14, React 18, TanStack Query, Node test runner, GitHub Actions, Railway, Vercel.

---

### Task 1: Backend ladder contract

**Files:**
- Modify: `backend/tests/test_upskilling_service.py`
- Modify: `backend/app/services/upskilling_service.py`
- Modify: `backend/tests/test_database_migrations.py`

- [ ] **Step 1: Write failing service tests**

Add tests that seed `skills.display_name`, a CV `matched_level` above the
assessed level, and 10 active questions per level. Assert:

```python
row["display_name"] == "Machine Learning"
row["cleared_level"] == 1
row["assessed_level"] == 1
row["next_level"] == 2
row["max_bank_level"] == 5
row["on_cv"] is True
```

Also assert the service taxonomy select contract contains `display_name` and
not `name`.

- [ ] **Step 2: Verify RED**

Run:

```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests/test_upskilling_service.py -q
```

Expected: failure because the service selects `name` and promotes
`matched_level` into `cleared_level`.

- [ ] **Step 3: Implement the service contract**

Use one taxonomy column constant:

```python
SKILL_DISPLAY_COLUMNS = "id, taxonomy_key, display_name"
```

Use it in ladder and gap-calibration reads. Build display names from
`display_name`, and set ladder-cleared progress from assessed rows only.

- [ ] **Step 4: Add the checked-in schema contract**

Parse the `CREATE TABLE skills` body in `database/schema.sql` and assert every
column in `SKILL_DISPLAY_COLUMNS` exists.

- [ ] **Step 5: Verify GREEN**

Run the focused backend tests and require zero failures.

### Task 2: User-scoped reward idempotency

**Files:**
- Modify: `backend/tests/test_upskilling_service.py`
- Create: `database/migrations/20260613_upskilling_reward_user_scope.sql`
- Modify: `backend/tests/test_database_migrations.py`
- Modify: `backend/app/services/upskilling_service.py`

- [ ] **Step 1: Write failing cross-user reward tests**

Seed a prior positive ledger row for user `u2`, submit the same skill/level for
`u1`, and assert `u1` still receives the reward. Preserve the existing same-user
re-clear test.

- [ ] **Step 2: Verify RED**

Run the focused service test and confirm the other user's ledger row incorrectly
blocks `u1`.

- [ ] **Step 3: Fix the Python pre-check**

Change `_level_already_paid` to accept `user_id` and include:

```python
.eq("user_id", user_id)
```

- [ ] **Step 4: Add the database migration**

Update `reward_xp` so its advisory-lock key and prior-ledger lookup include
`p_user_id`. Add a partial unique index on:

```sql
(user_id, action, ref_table, ref_id)
WHERE delta > 0 AND ref_table IS NOT NULL AND ref_id IS NOT NULL
```

Keep the existing referral-specific global unique index unchanged.

- [ ] **Step 5: Add migration contract tests and verify GREEN**

Assert the migration contains the user-scoped lock, lookup, unique index,
service-role grant, and PostgREST reload notification.

### Task 3: Honest frontend load states

**Files:**
- Create: `frontend/tests/upskilling-load-state.test.mjs`
- Modify: `frontend/components/skills/upskilling/upskilling-view.tsx`

- [ ] **Step 1: Write the failing source contract test**

Require the component to consume `isError`, `refetch`, and `isFetching`, render
an alert distinct from the empty-bank card, and wire Retry to `refetch`.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd frontend && node --test tests/upskilling-load-state.test.mjs
```

Expected: failure because errors currently fall through to the empty state.

- [ ] **Step 3: Implement the error state**

Render an accessible `role="alert"` card with a Retry button. Keep the current
empty-bank message only for a successful empty array.

- [ ] **Step 4: Verify GREEN**

Run the focused test, TypeScript, and lint.

### Task 4: Authenticated deployment smoke

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/smoke_upskilling.py`
- Create: `backend/tests/test_upskilling_smoke.py`
- Create: `.github/workflows/upskilling-production-smoke.yml`

- [ ] **Step 1: Write failing validator tests**

Test that ladder validation rejects an empty/no-startable payload and that set
validation requires 10 questions while rejecting `correct_index`.

- [ ] **Step 2: Verify RED**

Run the focused smoke test before creating the script.

- [ ] **Step 3: Implement the smoke client**

Read `MYRO_SMOKE_EMAIL`, `MYRO_SMOKE_PASSWORD`, and optional
`MYRO_API_BASE_URL`. Log in, fetch skills, choose a startable level, start a
set, and validate the response without printing credentials or tokens.

- [ ] **Step 4: Add the production workflow**

On pushes to `main`, install backend dependencies, poll `/health`, and execute
the smoke script with repository secrets.

- [ ] **Step 5: Verify GREEN**

Run focused smoke tests and validate the workflow YAML through repository CI
conventions.

### Task 5: Full verification and deployment

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run complete local verification**

```bash
.venv/bin/ruff check backend/app backend/scripts
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && node --test tests/upskilling-load-state.test.mjs
cd frontend && npm run build
git diff --check
```

- [ ] **Step 2: Apply and verify the Supabase migration**

Apply the checked-in migration to project `gipvxuugajkugntwkeiz`, then query
`pg_proc`, `pg_indexes`, and a cross-user-safe reward contract check.

- [ ] **Step 3: Commit and push `Develop`**

Commit scoped changes using conventional commit messages and push `Develop`.
Verify the dev Railway/Vercel deployments.

- [ ] **Step 4: Promote through `main`**

Use the normal GitHub pull-request path from `Develop` to `main`; do not commit
directly to `main`. Verify Railway production and Vercel production deployment
statuses.

- [ ] **Step 5: Run production smoke**

Run the authenticated smoke against `https://api.himyro.com` and confirm the
ladder endpoint returns a startable skill and a 10-question set.

- [ ] **Step 6: Update session summaries**

Record the root cause, migration, validation evidence, deployment identifiers,
and production smoke result in both cockpit files.

