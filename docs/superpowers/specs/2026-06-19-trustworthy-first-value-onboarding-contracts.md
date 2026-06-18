# Trustworthy First-Value Onboarding: Implementation Contracts

- **Date:** 2026-06-19
- **Status:** Approved supporting contract
- **Parent:**
  [Trustworthy First-Value Onboarding](2026-06-19-trustworthy-first-value-onboarding-design.md)

## Data model

### `user_profiles`

Add:

- `target_role_title TEXT` for the literal primary role;
- `target_seniority TEXT` with the approved seniority enum.

Keep `target_roles TEXT[]` during compatibility migration as derived taxonomy
clusters for existing scoring consumers. New UI displays `target_role_title`,
not those clusters. Existing users fall back to current values until editing.

### `user_onboarding_state`

Create one row per user with:

- user ID primary key and cascading auth-user foreign key;
- status: `draft`, `analyzing`, `result_ready`, or `completed`;
- current stage: `experience`, `target`, `result`, or `generator`;
- entry mode: `uploaded_cv` or `description`;
- current upload or preview job ID;
- accepted file metadata, excluding bytes and extracted content;
- resumable description text and preview payload;
- generator step, structured answers, and generated draft;
- result, completion, activation, and checklist milestone timestamps;
- activation kind; and
- created and updated timestamps.

Writes use authenticated endpoints. RLS limits reads to owner and service role.
Description and generator working data are cleared after safe baseline
persistence or explicit Start over.

`user_profiles.onboarding_complete` remains the compatibility read flag. It is
set only when the full-result completion endpoint succeeds, not when a baseline
row is created.

### `cv_skill_overrides`

Create baseline-scoped correction rows with owner, baseline version, skill,
`exclude` or `include`, evidence text, source location, and timestamps. A unique
baseline/skill key makes batch saves idempotent. RLS restricts ownership.

### `cv_versions.source`

Add `generated_baseline` to the source check. A description preview never
creates a CV version and never uses `text_describe` as a baseline source.

### `cv_upload_jobs`

Extend the durable job contract with analysis kind and true phases needed by
upload, preview, and generated-baseline flows. The status API continues to own
terminal truth and refund metadata.

### `user_job_matches`

Add or enforce:

- explicit `is_recommended` after evaluation;
- baseline version ID;
- target-context hash; and
- seniority compatibility.

Database constraints enforce score/verdict/recommendation invariants where
possible. Repository code selects the maximum three recommendations.

## Pipeline ordering

1. Server receipt starts upload or preview work immediately.
2. Reading and skill extraction may run while the user enters Target.
3. Canonical scoring waits for role, seniority, and location.
4. Match computation waits for both effective skills and Target.
5. Skill corrections apply after parser output and before score and matches.
6. Result assembly accepts only the latest baseline and target-context hash.
7. Result render records completion idempotently.
8. The first accepted next action records activation idempotently.

Description preview is isolated: no `cv_versions`, canonical `user_skills`,
`mirror_scores`, or `user_job_matches` writes.

## API boundaries

All frontend calls stay in `frontend/lib/api.ts`; TanStack Query owns server
state.

### Onboarding

- `GET /onboarding/state`: resume the journey.
- `PUT /onboarding/target`: save role, seniority, location, and trigger work
  waiting on Target.
- `POST /onboarding/profile-preview`: start preview-only analysis.
- `GET /onboarding/result`: return current proof, score explanation, credible
  match, and action state; reject stale context.
- `POST /onboarding/complete`: mark a rendered full result complete.
- `POST /onboarding/activate`: record the first accepted activation.
- `POST /onboarding/start-over`: clear only incomplete onboarding work.

### Baseline generator

- `PUT /onboarding/baseline/answers/{step}`: validate and autosave one step.
- `POST /onboarding/baseline/generate`: create and grounding-check a draft.
- `PUT /onboarding/baseline/draft`: save review edits.
- `POST /onboarding/baseline/approve`: create the baseline and start canonical
  analysis.

### Corrections

- `PUT /cv/{baseline_id}/skill-overrides`: save one correction batch and start
  one recompute.

Existing job-dismiss and restore endpoints remain canonical for Not interested.

## Result response

The result API returns a tagged union:

```text
profile_preview | full_result_processing | full_result_ready | terminal_failure
```

`profile_preview` contains target proof, evidence-backed preview skills, an
estimate range, and allowed actions. It cannot contain `total_score`, a promoted
job, or download data.

`full_result_ready` contains:

- baseline and target-context identifiers;
- role, seniority, and location proof;
- three to five evidence-backed skills;
- total and domain scores;
- three score factors and calculation metadata;
- zero or one credible primary match;
- primary, secondary, and quiet action descriptors; and
- completion and checklist state.

The server selects action state. The frontend does not infer credibility from
array order.

## Role and seniority resolution

Role suggestions come from normalized active job titles. Free text remains
valid. Saving stores the literal title and resolves internal domains/clusters
for legacy scoring.

Title matching produces separate role-family and seniority signals. Seniority
enum is Intern, Entry, Mid, Senior, Lead, Executive, or Any. Unknown seniority
cannot become a promoted match unless the user selected Any.

Target-context hash includes baseline version, literal role, seniority, and
normalized location. Changing any input invalidates promoted matches and queues
recomputation.

## Recommendation invariants

Before persistence:

- normalize invalid or missing LLM verdicts to non-recommended;
- force `Skip` whenever `overall_score < 3.5`;
- apply strict location and seniority gates;
- sort only eligible rows for recommendation; and
- set `is_recommended=true` on at most the top three.

A database check prevents `is_recommended=true` unless score and verdict qualify.
Read models expose explicit credible recommendations. Home and Practice remove
their first-row fallback.

## Browse groups

The Jobs response uses explicit group metadata:

```text
exact_city | remote_same_country | country_wide
```

Groups are appended in that order, omit dismissed jobs, and never update the
saved location. The UI renders server-provided dividers rather than parsing
location strings.

## Frontend structure

- `app/onboarding/page.tsx`: orchestration and resume redirect.
- `app/onboarding/result/page.tsx`: focused preview/full result.
- `components/onboarding/onboarding-progress.tsx`: sole outer progress source.
- `components/onboarding/experience-step.tsx`: upload/describe.
- `components/onboarding/target-step.tsx`: role, seniority, location.
- `components/onboarding/analysis-progress.tsx`: phases and reconnect.
- `components/onboarding/profile-preview.tsx`: description-only result.
- `components/onboarding/full-result.tsx`: proof, score, actions.
- `components/onboarding/score-explanation.tsx`: factors and method drawer.
- `components/onboarding/skill-correction-sheet.tsx`: overrides.
- `components/onboarding/baseline-generator/*`: questions and review.
- `components/onboarding/next-steps.tsx`: checklist.
- `components/jobs/not-interested-undo.tsx`: bottom Undo.

`useOnboardingState` owns queries, mutations, resume, and invalidation. Durable
progress does not live only in Zustand, session storage, or a component promise.

## Failure behavior

- Unsupported files fail before acceptance and preserve the rest of the draft.
- Accepted jobs survive refresh through their durable ID.
- Network errors reconnect and retry in place.
- Terminal provider failure shows refund state and Retry analysis.
- Score fetch failure does not restart parsing.
- Match failure still permits a full score result with no credible match.
- Preview failure preserves description and Target.
- Generator failure preserves answers and offers retry or deterministic output.
- Grounding failure never exposes the rejected draft.
- Correction failure preserves overrides and offers retry.
- Stale result context returns conflict/recompute, never old promoted matches.

## Privacy and security

- Bearer-token ownership applies to every endpoint.
- Service-role writes remain inside repositories and services.
- Authentication email is never copied into a CV.
- Descriptions, answers, evidence, and generated CVs are never logged.
- Redundant source content is cleared after approved baseline persistence.
- Public name remains outside onboarding.
- Provider and internal error details never reach UI copy.

## Analytics contract

Extend the aggregate event helper with non-sensitive properties only:

- journey start and entry mode;
- stage completion;
- browse escape and resume;
- reconnect, retry, and terminal failure category;
- time to Preview and full result;
- correction opened and correction counts;
- credible-match availability;
- generator start, question completion, generation, and approval;
- onboarding completion; and
- activation kind and time from completion.

Never send CV text, evidence, free-text role/company, name, email, contact
details, or generated baseline content to analytics.

## Accessibility and responsive contract

- Verify at 1280x720 and 375x812 with no horizontal overflow.
- Primary actions are at least 48px high with visible focus.
- Role suggestions implement accessible combobox/listbox semantics.
- Seniority is a labeled single-select, not unlabeled pills.
- Processing uses `aria-live=polite`; terminal errors use alert semantics.
- Text and visuals both communicate progress.
- Sheets, drawers, Undo, and Hidden jobs manage keyboard focus correctly.
- Reduced motion disables nonessential transitions.
- Snackbar never overlaps nav, sticky actions, or safe areas.
- Result remains coherent at 200% browser zoom.
