# Retention: people who arrive and stop

**Architecture spec #62. Implementation by Cursor. Written 2026-11-12 by Claude
from prod reads and a code walk.** It supersedes Cursor's handoff
`docs/HANDOFF_2026-11-12_feed_shows_tailor_users_stop.md` (gitignored, so
another checkout cannot see it). That handoff's diagnosis holds. Its fix would have
built a second short-edit editor beside one that already exists. This spec
reuses that editor instead.

> **VERIFY IN CODE before building.** Line numbers are from `01481129`. One chunk
> = one commit on `Develop`, six gates green, `git add` only your own files.
> Migrations are applied before the code that reads them, then
> `NOTIFY pgrst, 'reload schema';`.

---

## 1 · What is broken, measured 2026-11-12

Myro's own accounts excluded. Last 30 days unless named.

| Step | People | Lost here |
|---|---:|---:|
| Signed up | 101 (94 via Finlatics SSO) | |
| Uploaded a CV | 42 | **59**: 0 of them even started an upload (`cv_upload_jobs`) |
| Got judged jobs | 31 | |
| Saw a job card (`job_recommendation_exposures`) | 9 | **22**: 21 had left before their first verdict landed (median 5 min after signup) |
| Saved | 7 | |
| Tailored (`cv_versions.job_id` set) | 6 | |
| Applied | 0 | |

Returning this month: 36 people; 18 of them have no CV. Weekly signups: 63
(wk of 08-24) → 7 (wk of 11-09). Since 2026-11-03 nobody has opened the editor
(`editor_opened`) or tailored.

Caveats. `last_active_at` is copied once a day, so "left before the verdict" is
coarse. `route_perf_events` is sparse (10 of the 59 no-CV people have one), so
it cannot say what they saw.

**Three leaks, in order of people lost:** never upload (59) → never see the jobs
judged for them, because nothing calls them back (22) → open the tailor room and
press nothing (handoff: 4 of 6).

---

## 2 · Owners you reuse, never re-create

Each of these is the ONE place its answer lives. A chunk that writes a second
one is wrong even if its tests pass.

| Question | The one owner | Do not |
|---|---|---|
| Where a tailor session opens | `frontend/lib/cv/tailor-order.ts` `landingStep` | branch on step anywhere else |
| Free, job-aware "put a true skill on a bullet" | `components/cv/builder/gap-session.tsx` + `POST /cv/{job_id}/gap-plan` | build a new short-edit editor |
| Writing a job's own CV | `use-cv-playground.ts` `patchJobCv` → `POST /cv/versions` (seeds once) + `PATCH /cv/versions/{id}/job-draft` (ADR-0025) | add a CV kind, endpoint or second document |
| The job's stage (found/saved/tailored/applied) | `backend/app/services/collections/resolve.py` `_stage`, read on the client via `lib/collections/use-collection.ts` `byId` | add `stage` to the feed payload, derive it from `cv_versions` in the client, or use `cv_badge` (that is company-level) |
| The line written to the reader | `pick_reason`, checked by `reader_voice` when `llm_ranker._reader_line` writes it (ADR-0024 §4) | show `summary`, generate a line at render time, backfill old verdicts |
| The Apply button + "Did you submit?" | `components/jobs/use-apply-capture.tsx` + `ApplyCapturePrompt` + `applyLinkAttrs` | a new apply click path or intent writer |
| The one email about jobs | `backend/app/services/golden_digest.py` (cadence, claim, unsubscribe, `user_notifications` row) | a second mailer, cron or notification kind |
| Loop step names | `core_loop_events_step_check` + `routers/telemetry.py:87` + `lib/api.ts` `CoreLoopStep` | a step name in one of the three and not the others |

Out of scope, leave alone: weave pricing (50 coins, charged only when it reworks a
role), the two match numbers (#58's open item), `is_recommended`, semantic search,
the Notice digest, `golden_list_since`'s meaning (Shivam names those people).

---

## 3 · The chunks

Four lanes. Lanes do not share files, so different Cursor sessions can run them at
the same time. Inside a lane, run the chunks in order.

| Lane | Chunks | Files it owns |
|---|---|---|
| A · tailor room | R1 → R2 | `lib/cv/tailor-order.ts`, `components/cv/builder/gap-session.tsx` |
| B · feed card | R3 → R4 | `repositories/jobs.py` (badge cols), `routers/jobs/list.py`, `schemas/jobs.py`, `components/market/*`, `components/jobs/myro-take.tsx`, `components/collections/collection-rows.tsx`, `mobile/redesign/swipe-card.tsx` |
| C · call-back email | R5 | `services/golden_digest.py`, `ARCHITECTURE_GOLDEN_DIGEST.md` |
| D · upload drop | R6 | one migration, `routers/telemetry.py`, `lib/api.ts` `CoreLoopStep`, `components/onboarding/experience-step.tsx` |

R4 and R6 both touch `lib/api.ts`, in different types. Rebase before you commit.

### R1 · A never-tailored job opens on the free step

**Why.** Pressing Tailor CV on a never-tailored job lands on `"proof"`, the weave
overlay with a 50-coin lead (`willCharge("proof")`, `use-tailor-landing.ts:80`).
The free gap step, which already writes the job's own CV, sits behind it.

**Do.** In `landingStep`, for `proposal === "none"` and `!acceptComplete`: if
`closableGaps > 0`, return `"gaps"`. If `closableGaps === 0`, keep `"proof"`:
nothing is left to surface, so the weave is the only move. `null` already waits
(`ready` is false). `autoOpens` and `overlayFor` need no change. Update the
2026-10-19 comment to say why the first door is free.

**Do not.** Change the weave's price or `willCharge`. Add a `TailorStep` value.

**Tests.** `tests/tailor-order-landing.test.ts`: never-tailored with gaps →
`"gaps"` and `willCharge` is false. Never-tailored with 0 gaps → `"proof"`.
Stale → `"weave"`, still charges. `tests/core-loop-tailor-contract.test.ts`
unchanged and green.

**Done when.** A QA account opens `/cv?jobId=` for a job it never tailored, the
gap deck opens by itself, no coin cost is shown, and one Accept leaves a
`cv_versions` row with that `job_id`, `kind = 'deterministic'`
(`playground-view.tsx:457` → `patchJobCv`). Read the row in SQL; do not trust
the screen.

### R2 · The first gap deck is short, with no score in front

**Why.** The 2026-10-19 read: people faced with a 0/100 score, a rail and four
buttons pressed nothing. GapSession's header shows a live JD-match meter
(`LiveMeter`), which starts at a low number in front of the first card.

**Do.** When GapSession opens as the first landing (no job document yet), walk
at most 3 cards, latent first (the deck is already built at
`gap-session.tsx:102-111`; slice it there). Hide the meter until the first
Accept moves it. A deck with 0 walkable cards (every gap is `absent`) leaves
through the existing closing panel, unchanged.

**Do not.** Write the master or the job draft differently: the playground's
`onApplied` already does both. Touch the no-fabrication guard.

**Tests.** A component test: first landing → ≤3 cards, no meter before an
accept, meter after one. A later visit to the same job → full deck.

**Done when.** R1's "done when", walked at 375px.

### R3 · The feed card says why

**Why.** `market-jobs-column.tsx:272` renders `<JobCard>` with no `lede`. The
feed reads `_MATCH_EVAL_BADGE_COLS` (`repositories/jobs.py:2832`), which does not
carry `pick_reason`. Only the full columns do.

**Do.**
1. Backend: add `pick_reason` to `_MATCH_EVAL_BADGE_COLS`. Set
   `r["pick_reason"] = ev.get("pick_reason")` in `_rank_feed_rows`
   (`routers/jobs/list.py:384`), and add the field to `JobFeedItem`
   (`schemas/jobs.py:677`). Run `/read-path-perf` first: one short line per
   card on the feed's light read. Record the payload change in the PR.
2. Frontend: add `pick_reason` to the `JobFeedItem` type. Add one pure helper,
   `lib/jobs/reader-line.ts` → `readerLine(v) = v.pick_reason?.trim() || null`.
   Pass it as the market card's `lede`, styled like `.tm-pick-lede-why`
   (`components/jobs/agent-pick-lede.tsx`). A null line renders no lede.
3. Same commit (delete on the way past): `myro-take.tsx:28` reads
   `r.pick_reason || r.summary`, which breaks ADR-0024 §4. Switch it to
   `readerLine`. Fix the two comments that promise the summary fallback
   (`schemas/jobs.py:119-121`, `lib/api.ts` `MatchBrainResult.pick_reason`).
4. Mobile: if `swipe-card.tsx` has a reason slot, feed it from `readerLine`;
   if not, add none.

**Do not.** Drop a card for a null `pick_reason`. Touch Agent Picks
(`agent_comment`, its own refusal rule). Re-rate or backfill verdicts.

**Tests.** A frontend test that the market `JobCard` gets the `pick_reason` lede
and never `summary`. A backend test that the feed row carries `pick_reason` from
the badge read. `test_llm_ranker.py` and `test_agent_picks_autogen.py` unchanged
and green.

### R4 · A tailored job's card asks for Apply

**Why.** After a tailor the card still says Tailor CV. Apply is the next rung, and
the card never offers it.

**Do.**
1. `jobs-tab.tsx` reads `useCollection(token)` (same query key as Collections
   and the CV lane, so a warm cache costs nothing) and passes
   `stage = byId.get(job_id)?.stage` down to the card.
2. Pull the Apply button out of `collection-rows.tsx:180-190` into one shared
   `components/jobs/apply-action.tsx` (`useApplyCapture` + `applyLinkAttrs` +
   `ApplyCapturePrompt`). Collections switches to it in the same commit.
3. `TriageButtons`: when `stage === "tailored"`, the accent button is
   `<ApplyAction>`, mounted only on tailored cards (each mount reads liveness,
   so mounting it on every card would fan out reads). Tailor CV becomes the
   quiet control that opens the same `/cv?jobId=`. A hosted listing
   (`listing_venue === "myro"`) keeps Apply here and is never sent back through
   the tailor door. Save and Skip are unchanged.
4. Phone: the same rule in `swipe-card.tsx`.

**Do not.** Make Save primary (that undoes the 2026-09-28 contract). Add a
stage to the feed payload. Write a second intent writer.

**Tests.** Extend `core-loop-tailor-contract.test.ts`: untailored → Tailor CV is
the accent, emits `card_tailor`, routes to `/cv?jobId=`. Tailored → Apply is the
accent, records an apply intent. Hosted + tailored → Apply here only. The
collections apply tests stay green on the shared component.

**Done when.** One QA job goes found → Tailor CV → Accept one gap → back to
/market: the card shows Apply, the click writes `job_apply_intents`, and
"Did you submit?" appears on return. Desktop and 375px.

### R5 · "Your jobs are ready": widen who gets the digest

**Why.** 21 of the 22 people whose jobs were judged but never seen had left before
the verdicts landed. Myro sends no email to call them back. The digest's first
email is already the right one: "every job on their /market list, best first".
It only goes to `golden_list_since` (4 people).

**Do.**
1. In `golden_digest.py`, add a pure `in_callback_cohort(profile, now)` and a
   constant `CALLBACK_SINCE` (the day R5 goes live). The cohort: not a test
   account, not unsubscribed, `created_at >= CALLBACK_SINCE`, and
   `created_at` within 30 days of `now`.
2. `SupabaseStore.members()` returns golden-list members ∪ the cohort, each
   once. A golden-list member keeps its own `since`. A cohort member's first
   `since` is its `created_at`.
3. Everything else is the digest as built: `compose(first=True)`, at most one
   every 3 days, nothing to say → no email, the claim row, one-click
   unsubscribe, 0 judge calls. The links already land on `/cv?jobId=`, which is
   R1's free door.
4. Update the status block in `ARCHITECTURE_GOLDEN_DIGEST.md`.

**Forward pass.** This finishes work the person started: they uploaded, and the
judge ran. Because the cohort begins at `CALLBACK_SINCE`, the ~1,100 earlier
signups are never mailed (CLAUDE.md, never backfill). Do not set
`golden_list_since` for anyone.

**Do not.** Add a notification kind, a mailer, a cron or a second unsubscribe.
Mail anyone outside the cohort.

**Tests.** `test_golden_digest.py`: cohort edges (test account, unsubscribed, a
day before `CALLBACK_SINCE`, day 31). A union member listed once. A first send
lists the whole list. The 3-day cadence holds for the cohort.

**BLOCKED for the live send.** The dry run and `--preview-to` can ship. Turning it
on waits on (a) R1 on `main`, (b) Shivam approving the preview (digest S4), and
(c) Shivam deciding whether Myro may email Finlatics-SSO users directly (93% of
new signups).

### R6 · Measure the upload drop before redesigning it

**Why.** 59 of 101 never upload, and 0 of them started one. All 59 have no
`user_onboarding_state` row. `entry_mode` shows no CV-generator use in 60 days.
Nothing records whether the upload screen was even shown, so a redesign now
would be a guess.

**Do.**
1. Migration (additive): add `upload_shown` to `core_loop_events_step_check`.
   Apply it, `NOTIFY pgrst`, then add the step to `routers/telemetry.py:87` and
   `CoreLoopStep`.
2. Emit `upload_shown` once per person when `ExperienceStep` renders the upload
   for a signed-in user.
3. Walk `/onboarding` at 375px and desktop with a fresh QA account
   (`scripts/qa_front_door.py reset`). Keep screenshots out of git. Note
   whether the no-CV paths `ExperienceStep` takes (`onDescribe`,
   `onGuideMe` → `baseline-generator.tsx`) are visible without scrolling at
   375px.
4. After 7 days, read: SSO landed (`partner_users.linked_at`) → `upload_shown`
   → `cv_upload_jobs` → `cv_versions`. Write the numbers in this file. The fix
   is a separate chunk (R7), decided on those numbers.

**Do not.** Change onboarding copy or order in R6.

---

## 4 · Re-measure, one week after each chunk ships

Same pairs, no new tables. Baseline is from 2026-11-12.

- **R1–R2:** of `mentor_opened` on never-tailored jobs, how many get a
  `cv_versions` row for that person and job after the event. Baseline: 0 since
  11-03.
- **R3:** of shown pairs (`job_recommendation_exposures`) with a non-null
  `pick_reason`, how many are tailored after the show, vs those without one.
  Baseline: 13 of 9,302.
- **R4:** of tailored pairs, how many have a `job_apply_intents` row, then a
  status other than `saved`. Baseline: 14 applied rows ever.
- **R5:** of cohort members emailed, how many have `last_active_at` after the
  send, then a `card_tailor`/`panel_tailor` step. Baseline: 1 of 22 came back.
- **R6:** the four-step read above.

---

## 5 · Status

| Chunk | State |
|---|---|
| R1–R4, R6 | Spec only. Cursor. |
| R5 | Spec only. Live send blocked on Shivam (preview + Finlatics email). |
