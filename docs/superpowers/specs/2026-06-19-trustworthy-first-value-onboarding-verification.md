# Trustworthy First-Value Onboarding: Verification

- **Date:** 2026-06-19
- **Status:** Approved supporting contract
- **Parent:**
  [Trustworthy First-Value Onboarding](2026-06-19-trustworthy-first-value-onboarding-design.md)

## Backend coverage

- Preview creates no baseline, canonical score, skills, or matches.
- Target save unblocks scoring and matching exactly once.
- Refresh and retry return the same idempotent analysis job.
- Transient polling errors cannot mark a job failed.
- Terminal failure and refund behavior remain correct.
- Generated baseline grounding rejects invented facts and has deterministic
  fallback.
- Baseline approval uses `generated_baseline` source.
- Completion requires a full result.
- Skill overrides require evidence and trigger one recompute.
- Role and seniority compatibility are independent signals.
- Score below 3.5 always persists Skip.
- Only qualifying rows become recommended, maximum three.
- Context hash rejects stale matches.
- Dismissed jobs remain absent and can be restored.
- Browse expansion follows exact city, in-country remote, country-wide.
- Completion and activation endpoints are idempotent.

## Frontend coverage

- One progress source, correct labels, and working Back navigation.
- Immediate upload handoff and reload resume.
- Role title rather than skill-cluster selection.
- Editable inferred seniority.
- Browse jobs instead preserves draft.
- Profile Preview cannot render full score, download, or recommendation UI.
- Question N of 5, autosave, Back, resume, and review.
- Proof precedes score without a confirmation gate.
- All three primary-action states.
- Low-fit and unevaluated jobs never become best match.
- Reconnect and terminal failure are distinct.
- Correction sheet saves once and restores focus.
- Bottom Undo placement and Hidden jobs restore.
- Checklist completion and dismissal.

## Required checks

```text
pytest backend/tests
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
cd frontend && npm run build
```

## Browser QA

Use a disposable account for upload and no-CV paths at 1280x720 and 375x812.
Inject a network interruption during polling, refresh mid-generator, test zero
credible matches, dismiss and undo a job, and confirm a stored Skip job cannot
appear in any promoted slot. Delete the account and verify owned rows are gone.

## Deployment

1. Add database fields and tables without removing legacy profile fields.
2. Deploy backend dual-read support and migrations to shared Supabase.
3. Deploy frontend to the Develop preview environment.
4. Run disposable-account desktop/mobile QA against the dev backend.
5. Verify completion, activation, recovery, recommendation invariants, and row
   cleanup in the shared database.
6. Promote through Develop to main only after preview acceptance.
7. Remove compatibility reads later, after existing-user fallback is verified.

## Acceptance criteria

- A new user can upload a CV or create a fact-grounded baseline through five
  anxiety-reducing questions.
- The user sees what Myro understood before the score.
- A description alone cannot become a full score or downloadable CV.
- Refresh and network interruption do not erase accepted work or create false
  failure.
- One role, seniority, and location drive the current score and matches.
- No Skip, low-score, stale-context, seniority-incompatible, or unevaluated job
  can be promoted.
- No credible match produces an honest non-job primary action.
- Browse broadens only within country and announces scope.
- Not interested persists everywhere, Undo sits at viewport bottom, and Hidden
  jobs can restore the item.
- Result actions fit desktop first viewport and the 375px layout.
- Completion and activation follow the locked definitions without sensitive
  analytics properties.
- Full backend, TypeScript, lint, build, and browser checks pass.
