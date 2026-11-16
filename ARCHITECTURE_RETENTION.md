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

**Correction, 2026-11-16.** "Tailored" in this table counts job documents, and
the page writes one 1.2 s after it opens (R0). Read it as "opened the tailor
page". Nobody in this table is known to have changed a line.

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
| A · tailor room | R0 → R1 → R2 | `lib/cv/tailor-order.ts`, `components/cv/builder/gap-session.tsx`, and for R2 `components/cv/builder/use-tailor-landing.ts`, `components/cv/builder/playground-view.tsx`, and for R0 `lib/hooks/use-cv-playground.ts` |
| B · feed card | R3 → R4 | `repositories/jobs.py` (badge cols), `routers/jobs/list.py`, `schemas/jobs.py`, `components/market/*`, `components/jobs/myro-take.tsx`, `components/collections/collection-rows.tsx`, `mobile/redesign/swipe-card.tsx` |
| C · call-back email | R5 | `services/golden_digest.py`, `ARCHITECTURE_GOLDEN_DIGEST.md` |
| D · upload drop | R6 | one migration, `routers/telemetry.py`, `lib/api.ts` `CoreLoopStep`, `components/onboarding/experience-step.tsx` |

R4 and R6 both touch `lib/api.ts`, in different types. Rebase before you commit.

### R0 · Opening a job's CV must not write its document

**Why.** Found in the verify pass of 2026-11-16. `use-cv-playground.ts` keeps
`lastSavedRef` at `""` until a job document hydrates it (`:127`). On a job with
no document nothing does, so the debounced autosave (`:375-397`) sees a
projection that differs from `""` and calls `saveVersion` 1.2 s after the page
mounts. The comment above it says the first edit creates the document. The code
creates it on arrival.

`collections/resolve.py` `_stage` calls a job `tailored` when that row exists.
So `tailored` has meant "opened the page for 1.2 seconds".

Measured, own accounts excluded: real people have 12 job documents since
2026-09-28. 11 follow an `editor_opened`, and all 11 were written within 5 s of
it (median 1.33 s). None has a `weave_ran` or a `review_done`. With the QA
account, opening `/cv?jobId=` and touching nothing left a row each time.

What it breaks here. R2's `firstLanding` is already false when the deck mounts,
so the short deck, the hidden meter and the hand-over never run (walked
2026-11-16: the skills list and a 0% meter, on `4aa225a6`). R4's card turns to
Apply after a page open. R1's "done when" row proves nothing. §1's "Tailored"
and §4's baselines count opens.

**Do.**
1. A job with no document writes nothing until the person changes something.
   Fix the one comparison: when the versions read settles with no document for
   this job, `lastSavedRef` holds the serialisation of the projection on screen.
   The same wherever the hook resets for another job.
2. Keep every write a person causes: a toggle, a section move, `patchJobCv`,
   weave apply, the unmount flush of a real change.
3. Download and the apply snapshot: read what each needs. If one needs the
   document, it creates it at that click, as that person's act.
4. Then walk R2 (a) and (b) and R4 again.

**Do not.** Change `_stage` or what `tailored` means. Delete or relabel rows
already written: never backfill. Add a "dirty" flag beside `lastSavedRef`.

**Tests.** Hook test: mount on a job with no document, wait past the debounce:
no `versions.create`. Toggle one line: one create. Unmount with nothing
changed: no create.

**Done when.** QA: open a never-tailored job's `/cv?jobId=`, wait 10 s, touch
nothing: SQL shows no `cv_versions` row for that job, and Collections shows it
saved. Toggle one line or accept one gap card: one row, and Collections shows
it tailored.

### R1 · A never-tailored job opens on the free step

**Why.** Pressing Tailor CV on a never-tailored job lands on `"proof"`, the weave
overlay with a 50-coin lead (`willCharge("proof")`, `use-tailor-landing.ts:80`).
The free gap step, which already writes the job's own CV, sits behind it.

**Do.** In `landingStep`, for `proposal === "none"` and `!acceptComplete`:
return `closableGaps === 0 ? "proof" : "gaps"`. A known 0 keeps `"proof"`:
nothing is left to surface, so the weave is the only move. `null` lands on
`"gaps"`, the same rule the two lines beside it already use for `null`.
`autoOpens` and `overlayFor` need no change. Update the 2026-10-19 comment to
say why the first door is free.

**`null` does not wait** (corrected 2026-11-15; this spec first said it did).
For this branch `ready` is true as soon as the weave GET succeeds
(`use-tailor-landing.ts:58-60`), and the open effect latches on that step.
Leave `ready` alone. `closableGaps` comes from `jd-coverage`, a model read with
`retry: false` (`use-playground-model.ts:69-75`): on a first visit it lands
seconds after the weave GET, and it can fail. Waiting on it would hold the door
shut, or never open it, which is the bare editor of 2026-10-19 again. So a
first visit opens the free deck at once. If coverage later says 0, the deck has
already read its own plan and closes on "No gaps to close"; the weave stays on
the header with its price.

**Do not.** Change the weave's price or `willCharge`. Add a `TailorStep` value.
Touch `use-tailor-landing.ts`.

**Tests.** `tests/tailor-order-landing.test.ts`: never-tailored with gaps →
`"gaps"` and `willCharge` is false. Never-tailored with `null` → `"gaps"`,
`willCharge` false. Never-tailored with 0 gaps → `"proof"`. Stale → `"weave"`,
still charges. `tests/core-loop-tailor-contract.test.ts` unchanged and green.

**Done when.** A QA account opens `/cv?jobId=` for a job it never tailored, the
gap deck opens by itself, no coin cost is shown, and one Accept leaves a
`cv_versions` row with that `job_id`, `kind = 'deterministic'`
(`playground-view.tsx:457` → `patchJobCv`). Read the row in SQL; do not trust
the screen.

### R2 · The first gap deck is short, has no score in front, and is never a dead end

**Why.** The 2026-10-19 read: people faced with a 0/100 score, a rail and four
buttons pressed nothing. GapSession's header shows a live JD-match meter
(`LiveMeter`), which starts at a low number in front of the first card.

**What R1's verify pass found, 2026-11-15.** With the QA account, R1's door
opened by itself on live never-tailored jobs and charged nothing. On every one
the deck had no card to accept: the gap plan returned 0 walkable cards on 9 of 9
live jobs probed. The person pressed Tailor CV and got "Build these in practice"
and Done. Before R1 that person was at least offered the weave. The QA CV is
thin (5 skills, 11 bullets; the real median is 13 skills), so how often a real
deck is empty is not known. It must still lead somewhere that tailors.

The paid door first is not the answer either. Since 2026-10-22 the weave offer
auto-opened for 5 real people (`mentor_opened`, surface `auto`). None ran it
(`weave_ran`: 0).

**Do.**
1. When GapSession opens as the first landing (no job document yet), walk at
   most 3 cards, latent first (the deck is already built at
   `gap-session.tsx:102-111`; slice it there). Hide the meter until the first
   Accept moves it.
2. First landing, and the plan loads with 0 walkable cards: do not render the
   closing panel. `GapSession` calls a new `onNothingToWalk` once.
   `use-tailor-landing.ts` gains `openWeave()` beside `openGapsMap()`, and the
   playground answers the callback with it. A later visit to the same job keeps
   today's closing panel.
3. Closing panel: show the climb only when `resolved > 0`. `startScore` is
   captured at mount, before the score has loaded, so the panel read
   "0% → 68%" with nothing surfaced.

**Do not.** Write the master or the job draft differently: the playground's
`onApplied` already does both. Touch the no-fabrication guard. Decide the
hand-over in `landingStep`: it cannot know the deck, only the loaded plan can.
Run the weave for the person: the hand-over opens the offer, they press.

**Tests.** A component test: first landing → ≤3 cards, no meter before an
accept, meter after one. A later visit to the same job → full deck. First
landing with an empty deck → `onNothingToWalk` fires once and no closing panel.
A later visit with an empty deck → the closing panel. No climb when nothing
was surfaced.

**Done when.** Two QA walks, desktop and 375px. (a) A job whose deck is empty
lands on the weave offer, and no coin moves until the person runs it. (b) A job
with a card: one Accept leaves the `cv_versions` row R1 names. Walk (b) needs a
QA CV that yields a card. Today's does not, so give the QA account a fuller CV
first.

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

**Partner users are in the cohort** (Shivam, 2026-11-12: Myro emails
Finlatics-SSO users directly). They are 93% of new signups and joined through a
partner's link, so they may not know the Myro name. Read `render()` as one of
them. If the email needs to say how they joined, take `partners.name` (via
`partner_users.partner_id`), never a hardcoded string. Active seats bill per seat, so
every return this brings is partner revenue too.

**BLOCKED for the live send.** The dry run and `--preview-to` can ship. Turning it
on waits on (a) R0 on `main` and R2 walked again (the email's links land on
that door, and without R0 it ends on a list of skills) and (b) Shivam approving
the preview (digest S4).
The preview must include at least one partner-SSO member.

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

Cursor builds, Claude verifies. Cursor writes "Built {date}"; only the verify
pass writes "Verified".

Gates on `4aa225a6`, clean checkout, 2026-11-16: backend 4,105 passed; frontend
types, lint, 1,290 tests, UI drift, reach and build pass. Nothing below is
"Verified": R0 stands in front of every walk.

| Chunk | State |
|---|---|
| R0 | Specced 2026-11-16 from the verify pass. Not built. First in lane A. |
| R1 | Built (`e8b93503`), on `main` since 2026-11-15 (#351). Verify 11-16: code and gates pass; the free door opens by itself and charges nothing. Its Accept proof is void until R0, because the row appears without an Accept. |
| R2 | Built (`435a6625`), on `main`. Verify 11-16: the code matches the chunk and its tests pass. **Fails in the app**: an empty first deck still shows the skills list and the meter, because R0's write makes `firstLanding` false before the deck mounts. Walk again after R0. |
| R2b | Not specced. A closed listing answers the gap plan with 404 (`gap_plan.py:106` `get_job_skills` reads live rows only; the weave reads the saved snapshot), so the deck shows "Couldn't read your gaps". Seen on one closed job. A rare door: decide after R2. |
| R3 | Built (`144b9da6`), on `Develop`. Verify 11-16: the diff matches the chunk, gates pass. Not walked on screen. |
| R4 | Built (`26a1abc9`, `43fd50d4`), on `Develop`. Verify 11-16: the diff matches the chunk, gates pass. Not walked. Until R0 a card turns to Apply after a page open. One change the chunk did not ask for: a hosted listing that is not tailored now leads with "CV for this role" and Apply here is the quiet button. Shivam's call. |
| R5 | Built (`4f96c29b`), on `Develop`. Finlatics users included (Shivam, 2026-11-12). Verify 11-16: the diff matches; no schedule exists (`cron.job`) and no digest row was written, so nothing has been sent. `CALLBACK_SINCE` is 2026-11-15, the build date: set it to the day the send is turned on. The email now says "You joined through {partner}." Live send waits on R0 on `main`, R2 walked again, and Shivam approving the preview. |
| R6 | Steps 1–2 built (`4aa225a6`), on `Develop`. Verify 11-16: `upload_shown` is on the live CHECK and one event is recorded. It fires once per mount, not once per person: count distinct people. Open: the walk (step 3) and the 7-day read on 2026-11-23. |

---

## 6 · Handing a chunk to Cursor

One prompt. Change the chunk id and paste it into a fresh Cursor chat. One chunk
per chat, so a chat never carries a finished chunk's files into the next one.

```text
Read CLAUDE.md, then ARCHITECTURE_RETENTION.md in full. Build chunk R1 only.

1. Before any edit, open every file the chunk cites and check the cited lines
   still say what the spec says. If one does not, stop and tell me what you
   found. Do not improvise around it.
2. Section 2 names the one owner of each answer. Reuse it. Add nothing the
   chunk does not name: no new editor, endpoint, CV kind, stage, mailer, cron,
   notification kind or button label.
3. Touch only the files your lane owns (section 3 table) plus the tests the
   chunk names, plus BACKLOG.md for this chunk's row. If you need any other
   file, stop and ask.
4. Write the chunk's tests first and watch them fail. Then write the code.
5. Anything the chunk marks BLOCKED or "Do not" stays unbuilt and switched off.
6. A migration is applied before the code that reads it, then
   NOTIFY pgrst, 'reload schema'. If you cannot apply it, stop there and say so.
7. Run all six gates from CLAUDE.md. Paste the last lines of each.
8. git add only the files you changed, never -A or a dot. One commit on Develop,
   then push. Never touch main.
9. In that commit, set the chunk's row in section 5 to "Built {today}", and
   write the same fact on the #62 row in BACKLOG.md. Leave the row while later
   chunks are still open.
10. Reply with: the files changed, the gate output, and the proof the chunk asks
    for under "Done when". If the proof needs a QA walk or a SQL read, do it and
    paste the result. If you could not do it, say so. Do not write "done".
```

**Order.** R1–R6 are built (section 5). Next, one chat: R0, then the walks it
unblocks. The order they were built in: R1 → R2 → R6 → R5 → R3 → R4. R1 first
because R5's live send waits on it. R6 early because its read needs 7 days of
data. R5 before the card work because its preview waits on Shivam. With several
chats at once: one chat per lane (A, B, C, D), never two in one lane.

**After each push**, Claude reads the diff against section 2 and the chunk's
"Do not", reruns the gates, reads the proof row in SQL, and either writes
"Verified {sha}" in section 5 or sends Cursor one fix prompt.
