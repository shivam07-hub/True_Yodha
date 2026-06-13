# Upskilling Production Hardening Design

**Date:** 2026-06-13

**Status:** Approved for implementation

## Goal

Make `/forge` reliably expose every servable question bank, distinguish API
failures from genuinely empty banks, preserve honest quiz progression, and
prevent one user's reward history from affecting another user.

## Root Causes

1. `upskilling_service.py` selects `skills.name`, while the canonical taxonomy
   column is `skills.display_name`. PostgREST rejects the query.
2. `UpskillingView` treats a failed `/upskilling/skills` query as an empty array,
   so the production error is presented as "question banks are still filling."
3. `list_skills()` treats CV-inferred `user_skills.matched_level` as quiz-cleared
   progress. A user can therefore skip unassessed ladder levels.
4. `_level_already_paid()` omits `user_id`, and the `reward_xp` RPC uses the same
   global idempotency key. A clear by one user can suppress another user's reward.
5. CI does not verify that service-selected taxonomy columns exist in the
   checked-in database contract.
6. There is no authenticated production smoke test for the complete
   ladder-list and set-start path.

## Chosen Approach

Use a targeted full-stack hardening pass.

- Keep the existing FastAPI, Supabase, TanStack Query, Railway, and Vercel
  architecture.
- Correct all upskilling taxonomy reads to `display_name`.
- Keep `user_skills.matched_level` as the headline CV/skill level, but use only
  `skill_assessed_level.assessed_level` for ladder-cleared progress.
- Scope reward checks and the database RPC idempotency key by `user_id`.
- Add a partial unique index for user-scoped positive rewards so concurrency
  safety is enforced by PostgreSQL, not only Python.
- Render a retryable API-error state separately from the true empty-bank state.
- Add contract tests and an authenticated smoke script that verifies both
  `GET /upskilling/skills` and `POST /upskilling/sets`.

Alternatives rejected:

- A database compatibility view exposing a fake `name` column would preserve a
  wrong application contract and hide future drift.
- Frontend-direct Supabase reads would duplicate authorization and answer-key
  security logic already owned by FastAPI.
- Catching the backend exception and returning `[]` would preserve the
  misleading user experience.

## Backend Contract

`list_skills(user_id)` returns every skill with at least one active bank level.
For each row:

- `display_name` comes from `skills.display_name`, falling back to
  `taxonomy_key`.
- `cleared_level` and `assessed_level` come from
  `skill_assessed_level.assessed_level`.
- `on_cv` is true when a matching `user_skills` row exists.
- `max_bank_level` is the highest level with at least
  `UPSKILLING_SET_SIZE` active questions.
- `next_level` is `min(cleared_level + 1, 5)`.

The same taxonomy display contract applies to job-gap calibration responses.

## Reward Contract

An upskilling reward is idempotent for:

`(user_id, action, ref_table, ref_id)`

The Python pre-check and PostgreSQL `reward_xp` function use the same key. The
RPC advisory lock includes `user_id`, and a partial unique index protects
positive, referenced rewards against concurrent duplicate inserts.

The existing global referral-credit unique index remains in place, preserving
the rule that one referred signup can only pay once globally.

## Frontend States

`UpskillingView` has four explicit load states:

- Loading: show the existing ladder loader.
- Error: show an accessible load-failure card and Retry action.
- Empty success: show the existing "ladder is on the way" message.
- Ready: show the ladder.

Retry calls TanStack Query's `refetch()`. An API failure must never reuse the
empty-bank copy.

## Schema-Drift Gate

A backend test compares the upskilling taxonomy select contract with
`database/schema.sql`. It fails if an application-selected column is absent
from the canonical `skills` table definition.

The existing in-memory Supabase fake also records selected columns, so service
tests exercise the actual query shape.

## Deployment Smoke

`backend/scripts/smoke_upskilling.py`:

1. Logs into the configured API using a dedicated smoke-test account.
2. Calls `GET /upskilling/skills`.
3. Requires at least one unlocked/startable skill.
4. Starts the next servable set with `POST /upskilling/sets`.
5. Requires exactly 10 questions and rejects any response exposing
   `correct_index`.

A GitHub Actions workflow runs this smoke after pushes to `main`, polling the
production health endpoint before testing. Credentials live only in repository
secrets.

## Verification

- Focused backend upskilling and migration tests.
- Focused frontend load-state contract test.
- Full backend pytest and Ruff.
- Frontend lint, TypeScript, focused tests, and production build.
- Apply and verify the Supabase migration.
- Deploy `Develop`, verify dev API, then promote through the repository's normal
  `Develop` to `main` production path.
- Run the authenticated production smoke and verify `/forge` no longer receives
  an empty/error response for a bank-backed user.

