# Trustworthy First-Value Onboarding Implementation Plan

**Goal:** Replace the broken first-run flow with a resumable three-stage journey
that proves understanding, generates an honest baseline for no-CV users, and
never promotes an unqualified job.

**Architecture:** Add owner-scoped onboarding state and CV-skill overrides,
preserve literal role/seniority beside legacy taxonomy clusters, isolate preview
analysis from canonical CV writes, gate scoring on Target, and return a tagged
result contract whose primary action is selected server-side.

**Stack:** FastAPI, Pydantic, Supabase/PostgreSQL, Next.js 14 App Router, React,
TanStack Query, Tailwind/shadcn, pytest, node:test, in-app browser QA.

**Parent design:**
`docs/superpowers/specs/2026-06-19-trustworthy-first-value-onboarding-design.md`

## Task 1: Additive schema and repositories

**Files:**
- Create migration `trustworthy_first_value_onboarding`
- Create `backend/app/repositories/onboarding.py`
- Modify user, CV-upload, and jobs repositories
- Add migration and repository tests

1. Write failing SQL contract tests for profile target fields,
   `user_onboarding_state`, `cv_skill_overrides`, generated baseline source,
   upload analysis kind/phases, match context, recommendation constraints, RLS,
   explicit grants, and indexes.
2. Generate the migration with `supabase migration new` when CLI is available.
3. Add owner-select RLS and service-role writes; frontend never writes tables
   directly.
4. Implement typed repository methods for state resume, stage patching, preview
   payload, generator answers/draft, completion, activation, and clearing
   redundant source content.
5. Add baseline-scoped override reads and batch upsert.
6. Run focused tests, apply migration to shared Supabase, query catalog/policies,
   and commit `feat: add durable onboarding data model`.

## Task 2: Preview, generator, result, and correction API

**Files:**
- Create `backend/app/routers/onboarding.py`
- Create `backend/app/services/onboarding_service.py`
- Create `backend/app/services/baseline_generator.py`
- Modify CV workflow, parser orchestration, schemas, and router registration
- Add focused backend tests

1. Write failing tests for state resume, target save, preview isolation,
   generator step validation, fact grounding, deterministic fallback, editable
   draft, baseline approval, result tagged union, completion, and activation.
2. Start upload/preview work immediately. Permit Reading and Finding skills
   before Target; gate Scoring and matches until Target exists.
3. Keep descriptions out of `cv_versions`, canonical `user_skills`, scores, and
   matches. Store only a preview payload and estimate range.
4. Generate structured sections with stable fact IDs. Reject uncited entities,
   dates, numbers, credentials, or tools and fall back to deterministic text.
5. Approve the edited draft through the canonical text-upload pipeline with
   source `generated_baseline`.
6. Apply skill overrides after parser output and recompute once without
   rewriting baseline text.
7. Return server-selected result actions and record completion/activation
   idempotently.
8. Run focused tests and commit `feat: add trustworthy onboarding API`.

## Task 3: Credible matches, fresh context, and bounded browse

**Files:**
- Modify `backend/app/services/llm_ranker.py`
- Modify jobs workflow/repository/list schemas and tests
- Modify dismissal endpoints only where needed

1. Write failing tests for score/verdict normalization, maximum three credible
   matches, strict location, seniority compatibility, context hash, stale-match
   rejection, and no first-row fallback.
2. Persist `Skip` below 3.5 and set `is_recommended` explicitly only after all
   gates pass.
3. Store baseline ID, target-context hash, and seniority compatibility with each
   match; result reads accept only current context.
4. Return browse groups in exact-city, same-country remote, country-wide order.
   Exclude dismissed jobs at every tier and never mutate saved Target.
5. Keep Not interested separate from employer rejection and preserve restore.
6. Run focused tests and commit `fix: enforce trustworthy job recommendations`.

## Task 4: Frontend contracts and three-stage shell

**Files:**
- Modify `frontend/lib/api.ts` and domain query keys
- Replace `frontend/app/onboarding/page.tsx`
- Create focused onboarding components and CSS under 300 lines each
- Add pure contract tests

1. Write failing tests for API types, stage configuration, action matrix,
   generator validators/draft behavior, and preview/full-result separation.
2. Implement `useOnboardingState` with TanStack Query and durable resume.
3. Build the sole `Experience -> Target -> Result` progress source.
4. Build immediate upload and preview submission with reconnecting rather than
   false failure.
5. Replace skill-cluster selection with accessible role combobox, seniority
   single-select, and one location.
6. Add Browse jobs instead to every blocking stage without marking complete.
7. Run focused tests and commit `feat: build resumable onboarding journey`.

## Task 5: Generator, proof, score explanation, and correction UI

**Files:**
- Create `frontend/app/onboarding/result/page.tsx`
- Create baseline-generator, result, explanation, and correction components
- Add component/contract tests

1. Write failing tests for Question N of 5, progress, autosave, Back, review,
   Profile Preview restrictions, proof ordering, all action states, and focus.
2. Build five focused generator questions and editable review. Show
   `5 questions - about 2 minutes` before entry.
3. Build Profile Preview with evidence and estimate range but no full score,
   promoted job, download, or completion.
4. Build focused full result: proof, score, three impact factors, action, then
   domains. Keep action visible at 1280x720 and above mobile safe area.
5. Build the Radix/shadcn correction sheet with one batch save and focus return.
6. Run baseline UI, accessibility, focused tests, and commit
   `feat: add proof-first onboarding result`.

## Task 6: Product-wide trust integration

**Files:**
- Modify Home first-run hero and Practice recommendations
- Create shared credible-match selectors
- Create bottom Undo, Hidden jobs, and Next steps components
- Add regression tests

1. Write failing regressions proving Skip, unevaluated, stale, or incompatible
   jobs cannot appear in Home/Practice promotion.
2. Remove all first-row promotion fallbacks and render honest no-match actions.
3. Add viewport-bottom six-second Undo, safe-area/mobile-nav offset, replace-not-
   stack behavior, and Hidden jobs restore.
4. Add event-backed, dismissible Review gap -> Save job -> Tailor checklist.
5. Add non-sensitive onboarding analytics events only.
6. Run focused tests and commit `fix: align first-run surfaces with credible jobs`.

## Task 7: Full verification and delivery

1. Run backend tests, TypeScript, lint, focused frontend tests, production build,
   and `git diff --check`.
2. Start backend and frontend dev servers.
3. Use a disposable account to verify upload and no-CV paths at 1280x720 and
   375x812, including network interruption, refresh mid-generator, zero credible
   matches, correction, Not interested, Undo, and restore.
4. Verify database rows, RLS, context freshness, completion, activation, and
   disposable-user cleanup.
5. Run React best-practices review and fix new findings.
6. Update `AGENTS.md`, commit `docs: close trustworthy onboarding build`, fetch
   remote Develop safely, push, and verify the remote commit.
