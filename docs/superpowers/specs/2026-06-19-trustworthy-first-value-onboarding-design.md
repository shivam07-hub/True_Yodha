# Trustworthy First-Value Onboarding

- **Date:** 2026-06-19
- **Status:** Approved design
- **Primary route:** `/onboarding`
- **Result route:** `/onboarding/result`
- **North star:** Reach trustworthy, personalized value without forcing setup
- **Contracts:**
  [implementation](2026-06-19-trustworthy-first-value-onboarding-contracts.md),
  [verification](2026-06-19-trustworthy-first-value-onboarding-verification.md)

## Purpose

Replace the current six-screen onboarding with a durable three-stage journey:

```text
Experience -> Target -> Result
```

The journey proves that Myro understood the user before asking them to trust a
score or job recommendation. It also lets a user browse jobs at any time without
losing work or pretending onboarding is complete.

This closes the P1 onboarding and plain-language backlog and fixes the trust
failures found during the 2026-06-19 production QA pass.

## Production evidence

The audited first-run flow has five material failures:

1. The journey strip and page disagree about the current step. The heading asks
   for roles while the control stores skill-taxonomy clusters.
2. A transient polling or score-fetch error is treated as terminal failure.
   Entered targets are lost even when the durable backend job completed.
3. The score screen leads with download, pushes useful actions below the desktop
   fold, and routes "Full Skill Intelligence" to `/forge`.
4. Practice can recommend a skill based on an unrelated low-fit job rather than
   CV evidence or a credible target.
5. Home labels the first match as "BEST MATCH" when its stored evaluation says
   `Skip`, `is_recommended=false`, and `overall_score=1.2/5`.

No frontend may promote a job merely because it is the first row returned.

## Inspiration laws

The local Supabase, X, VS Code, Rev, and Myro references support one focused
action per screen, only immediately useful questions, optional learn-by-doing
guidance, one clear trust boundary, and milestone-based feature reveal. Myro
adopts those interaction laws, not the source products' visual styling.

## Locked decisions

1. Blocking onboarding contains only Experience, Target, and Result.
2. Public name, target companies, career lens, goals, and deal-breakers are
   deferred until their relevant product moment.
3. The result proves understanding before presenting a score.
4. Proof is shown directly; it does not add a confirmation click.
5. Onboarding asks for one primary role, one seniority level, and one location.
6. The role control uses job-role language, never skill-taxonomy labels.
7. A user can choose `Browse jobs instead` from every blocking stage.
8. Leaving preserves the draft and does not set onboarding complete.
9. Recommendations remain location-strict. Voluntary browse may expand from
   exact city to remote in-country to country-wide, never across countries.
10. Expansion is announced and never changes the saved target.
11. User rejection is `Not interested`, distinct from employer `Rejected`.
12. Not interested persists everywhere, supports a brief bottom Undo, and is
    recoverable from Hidden jobs.
13. Result correction is optional and labeled `Fix what Myro read`.
14. Corrections change effective skill interpretation, never CV text.
15. Myro Score is a starting point against current target-role skill demand. It
    is not an ATS pass score or hiring prediction.
16. A description creates a Profile Preview and incomplete Early estimate, not
    a baseline CV or full Myro Score.
17. A real baseline CV is required before onboarding can complete.
18. The no-CV path includes the accepted five-question baseline generator.
19. The generator states `5 questions - about 2 minutes`, shows Question N of 5
    and visual progress, and preserves Back navigation.
20. Generated CV statements must be grounded in user answers. Myro may polish
    wording but may not invent facts.
21. The user reviews and edits the generated baseline before approving it.
22. The full result is focused, with a minimal header and no full navigation.
23. Download is not an onboarding climax or primary action.
24. Post-result teaching uses a dismissible three-action checklist, not a tour.
25. Completion requires a trustworthy full result from an uploaded or approved
    generated baseline. Activation requires a meaningful next action.

## Scope
- Three-stage UI and durable state machine.
- Upload, description-preview, target, and generated-baseline paths.
- One primary role plus seniority and location.
- Truthful processing, reconnect, retry, and refund states.
- Proof, score explanation, correction, and contextual result actions.
- Backend credible-job enforcement and removal of unsafe UI fallbacks.
- Location-bounded browse expansion.
- Persistent Not interested, bottom Undo, and Hidden jobs recovery.
- Contextual post-result checklist and activation measurement.
- Desktop and 375px mobile verification.

## Non-goals
- Multi-location onboarding or automatic cross-country expansion.
- Company follows, goals, deal-breakers, career lens, or public name setup.
- A visual CV designer or template marketplace.
- A product tour or stacked coachmarks.
- Downloading a Profile Preview as a CV.
- Using low-confidence or unevaluated jobs as recommendations.

## Shared journey
One configuration owns stage labels, order, routes, and completion:

```text
Experience -> Target -> Result
```

Desktop names all stages. Mobile remains compact but names the current stage.
Completed stages are clickable and restore saved values. Child components never
render competing step badges. Tailoring and downloading stay post-onboarding.

Every blocking stage exposes `Browse jobs instead`. It saves the draft, opens
Jobs with available target data, leaves `onboarding_complete=false`, and later
offers one non-modal `Finish your profile` resume entry. There are no route traps
or repeated prompts.

## Experience
### Upload an existing CV

- Accept PDF and DOCX under existing limits.
- Start the durable upload job immediately after server receipt.
- Save its ID and non-content file metadata to onboarding state.
- Continue to Target while extraction runs.
- Never request an already accepted file again.

### Describe my experience

- Accept a concise professional description and start preview-only analysis.
- Do not create a CV version, canonical skills, full score, or personalized
  matches from it.
- Continue to Target while extraction runs.

## Target
The target contains exactly:

- primary role, such as Product Manager;
- seniority: Intern, Entry, Mid, Senior, Lead, Executive, or Any; and
- one location or remote preference.

Role search uses titles represented in active jobs and allows free text. Myro
stores the literal title and seniority, then derives internal role domains and
skill clusters. A CV may preselect seniority, but the user can change it.
Additional roles live in Improve matches or Settings.

Role-family and seniority matching stay separate. Normalization must not discard
seniority and recreate the apprenticeship-versus-senior-user failure.

## Analysis and recovery

Backend-owned user phases are:

```text
Reading -> Finding skills -> Scoring
```

The UI never invents progress. Scoring and matching wait for Target so an upload
cannot produce a targetless result represented as personalized.

- Persist job IDs and targets immediately.
- Resume polling after refresh, navigation, login return, or reconnect.
- Polling/network failure means reconnecting, not failed.
- Retry score retrieval independently from parsing.
- Preserve accepted inputs, generator answers, and draft until completion or
  explicit Start over.
- Show failure only from terminal backend status.
- Terminal failure shows refund state and Retry analysis without re-entry.
- Keep idempotency keys stable across retries.

## Profile Preview

The description path shows role, seniority, location, three to five detected
skills with expandable evidence, and an `Early estimate` range. It states once
that the estimate is incomplete because Myro has not read a full CV.

It never renders the Myro Score component, persists a score, claims job
readiness, recommends a job, or offers download.

- **Primary:** Build my starter CV
- **Secondary:** Upload an existing CV
- **Quiet:** Fix what Myro read
- **Escape:** Browse jobs instead

## Baseline generator

Each question is one autosaved screen with Back, Continue, Question N of 5, and
a five-segment progress indicator:

1. **How should your CV identify you?** Preferred name and optional CV contact.
2. **What work have you done?** Roles, organizations, dates, internships,
   volunteering, or substantial projects.
3. **What changed because of your work?** Concrete work, academic, or project
   outcomes.
4. **What can you do?** Skills, tools, and relevant projects.
5. **What backs it up?** Education and certifications.

Identity remains optional, auth email is never copied into the CV, and users
without formal employment are supported. At least one substantive fact is
required.

Answers have stable source IDs. Every generated bullet cites source IDs. The
server rejects uncited output or facts, dates, numbers, entities, credentials,
and tools absent from the cited answers. Failed grounding uses a deterministic
template fallback, never an ungrounded draft.

After all five questions, an editable review opens. `Approve baseline` alone
creates `kind='baseline_upload'` and starts canonical parsing, scoring, and
matching. Review is not a sixth question.

## Full result

`/onboarding/result` has a minimal Myro header and this fixed order:

1. What Myro understood
2. Your Myro Score
3. Why this score
4. Primary next action
5. Domain breakdown and deeper detail

The first viewport contains role, seniority, location, three to five relevant
skills, evidence, and quiet correction. No confirmation click is required.

The score definition is: "Your starting point against skills currently required
for your target role." Why this score shows the three largest evidence-backed
factors. A quiet method drawer explains domains and weighting plus the ATS and
hiring-prediction boundary. Deeper breakdown never pushes both explanation and
action below the first desktop viewport.

| Result state | Primary | Secondary |
|---|---|---|
| Profile Preview | Build my starter CV | Upload an existing CV |
| Full CV plus credible match | Tailor for role at company | Review score gaps |
| Full CV with no credible match | Review score gaps | Browse jobs |

Fix what Myro read remains quiet. Download is absent. The primary action is
reachable above the mobile safe area and visible at 1280x720 without scrolling.

## Corrections

The evidence-backed sheet lets a user mark a detected skill `Not mine`, add a
missing skill with a sentence from the current source, and inspect evidence.
One save applies overrides after parsing and before effective skills, score, and
matches. Overrides are scoped to the corrected baseline and do not migrate to a
later baseline. Saving starts one resumable recompute.

## Credible jobs

A promoted job must have `overall_score >= 3.5`, recommendation Apply or
Negotiate, backend-written `is_recommended=true`, strict location compatibility,
and compatible seniority (unless Any). Unknown-seniority and unevaluated jobs
may be browsed but cannot be promoted.

Backend persistence enforces:

```text
overall_score < 3.5 => recommendation = Skip
is_recommended = true => overall_score >= 3.5 and recommendation != Skip
```

At most three jobs qualify. Onboarding, Home, Practice, and every hero must use
this contract. No qualifying job produces an honest no-match state. Matches
carry baseline version and target-context hash so stale results cannot surface.

## Browse and dismissal

Voluntary browse appends exact-city, remote in-country, then country-wide groups
with visible expansion dividers. The API returns expansion tiers. Cross-country
requires explicit user action.

Reuse `user_dismissed_job_cards`. `Not interested` excludes a job from every
recommendation, Home, browse, and Practice surface. A six-second Undo sits at
the viewport bottom, above mobile navigation and safe area. Repeated dismissals
replace rather than stack snackbars. Hidden jobs offers Restore. Employer
`rejected` remains application history.

## Progressive learning

Goals and deal-breakers appear at Improve matches or no-match, companies inside
Jobs, and public name on first Share. These never form another wizard.

Home may show one dismissible Next steps checklist: review a score gap, save a
credible job, and tailor for it. Events complete the items across sessions. If
no credible job exists, the save action routes to bounded browsing.

## Success definitions

**Completed:** a trustworthy full result renders from an uploaded or
user-approved generated baseline.

**Activated:** after completion, the user starts tailoring a credible job, opens
a score gap to improve it, or saves a credible job.

Profile Preview and Browse jobs instead remain useful resumable progress, not
inflated completion.
