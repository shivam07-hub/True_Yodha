# One Prep: the Preparation room is the one place to upskill

**Architecture spec #67. Written 2026-11-27 by Claude from prod reads and a code
walk.** Decision PREP1 (Shivam, 2026-11-26), wireframe agreed the same day with
one change (all eleven Finlatics programmes in the rail). Builds on
[UNIFIED_PREP_V2.md](UNIFIED_PREP_V2.md), which stays the design of the room
itself.

> **VERIFY IN CODE before building.** Paths are from `aee2ff75`. One chunk =
> one commit on `Develop`, six gates green, `git add` only your own files.
> Migrations are applied before the code that reads them, then
> `NOTIFY pgrst, 'reload schema';`.

---

## 1 · Why, measured 2026-11-27

Real users only (`is_test_account` excluded).

| Surface today | Who it reaches |
|---|---:|
| A Preparation room (opens at `applied`) | **4 people** |
| Rehearsal or day-of brief, ever | 0 |
| A job-scoped drill in the room (`DrillPanel`, `quiz_attempts.job_id`), ever | 0 |
| `/practice` quizzes, last 30 days | 3 people (74 ever, 26 ever passed a level) |
| Evidence step (`jd_coverage`), last 30 days | 7 people (35 ever) |
| **Saved a job** | **89 people** (11 in the last 30 days; median 1 saved, p90 5, max 66) |
| **Have a target role** | **250 people** |

The room is the best prep surface Myro has, and it opens after the step almost
nobody reaches. Practice, the Score Map and Skill Path each sit on their own
page, and the room's step 2 sends people out to `/practice` to do the very
thing the room is asking for. Four homes for one job: get good enough for the
role you want.

## 2 · Decided

1. **The Preparation room is the one upskilling home** (PREP1). `/practice`,
   `/skills` and Skill Path stop being destinations: their links land in a room.
2. **One room per job you want, plus one for your target role.** The wireframe
   lists saved jobs as rooms ("Business Analyst · Deloitte · saved") and a
   "Your target role" room for practising before any job is saved.
   This **reverses the 2026-07-15 lock** "saved jobs never appear in Prep;
   Collections owns pre-apply". Collections keeps the list of saved jobs; the
   room is where you prepare for one.
3. **Four steps, same everywhere** (UNIFIED_PREP_V2): evidence, skill level,
   rehearsal, day-of brief. **Step 1 carries the Gap Plan** (what the CV
   already shows, what can be surfaced onto a CV line, what has to be earned).
   **Step 2 runs the five-level practice in place** (`skill_levels.LEVEL_STANDARDS`,
   L1–L5); clearing a level counts in every room that asks for that skill.
4. **The rail:** rooms, then the target-role room, then **"Skills your rooms
   ask for"** (replaces Skill Path), then **all eleven Finlatics programmes one
   by one, best match first** (`shelfRows` order: matched with their `why`,
   then the rest in catalogue order). No "three + All 11".
5. **The ₹199 and ₹599 offers sit in the room** as well as at the score moment
   on the CV page (ENG6). `PackOffer` is already built (§10 S9).

## 3 · Owners you reuse, never re-create

| Need | Owner (exists today) |
|---|---|
| The four steps, pips, pct | `services/prep_ladder.py`, `services/prep_ladder_read.py` (4 round trips, wave width 3) |
| Room shell, URL is the room | `components/preparations/prep-shell.tsx`, `prep-model.ts` `roomFromUrl` |
| Step 1 evidence | `CoveragePanel`, `GET /cv/jd-coverage` (cached in `job_deepenings`) |
| Gap Plan (latent / shallow / absent → one honest move) | `POST /cv/{job_id}/gap-plan`, `services/gap_planner.py`, `components/cv/builder/gap-session.tsx` |
| Step 2 rungs | `LevelRows` (`level-rows.tsx`), server `prep_ladder.level_rows` |
| A level's quiz | `QuizRunner` (`components/skills/upskilling/quiz-runner.tsx`), `upskilling.startSet(skill_id, level)` / `submitSet` |
| The carry between rooms | `skill_assessed_level` (per person, per skill) |
| Target role's skills, levels, demand, state | `GET /career-skill-path` → `anchor.cards` (`state`, `current_level`, `required_level`, `demand`, `next_practice_level`) |
| Finlatics match + order | `services/finlatics_match.py`, `training-shelf.tsx` `shelfRows`, `lib/finlatics-programs.ts` (11) |
| The paid offers | `components/apply-pack/pack-offer.tsx` |

Nothing in this spec adds a model call. Every step reads a signal that already
exists, the rule `prep_ladder` was built on.

## 4 · The room model

**Two kinds of room, one shape.**

| | Job room | Target-role room |
|---|---|---|
| Address | `/preparations/{job_id}` | `/preparations/role` (reserved; no job id is `role`) |
| Opens at | `saved`, `applied`, `interviewing`; `closed` keeps its record | a target role is set (250 people) |
| 1 · Evidence | this JD's requirements: covered / can be surfaced (Gap Plan) / to earn | the role's skills (`anchor.cards`): on your CV / practised / not evidenced |
| 2 · Skill level | the job's levelled asks, practised in place | the role's levelled skills, practised in place |
| 3 · Rehearsal | your answers asked back (`prep_rehearsal`) | needs a job (§9 Q1) |
| 4 · Day-of brief | 30 coins (`prep_brief`) | needs a job (§9 Q1) |

**Open room when none is named:** the hottest job room (`ladderOrder`), else
the target-role room. Today a person with no rooms sees the Finlatics shelf
(`NoRoomsDoor`). After P1, that is the target-role room's state, and the shelf
stays in the rail.

**Stage for a saved room** is `saved`, with the same four steps. The rail's
"N live" counts saved rooms; the totals footer counts only rooms that can still
move (`saved`, `applied`, `interviewing`).

## 5 · The chunks, in order

Order is reach first, nearest revenue next. Each ships alone and states the
number it should move.

### P1 · The target-role room — reach 250

- `prep-model.ts`: `roomFromUrl` returns `{ kind: "role" }` for `/preparations/role`.
- `prep-shell.tsx`: the rail pins "Your target role · Practise before you save a
  job" under the job rooms; it opens a `RoleRoom` with the same readiness band
  and step cards.
- Step 1 lists `anchor.cards` grouped by `state`; step 2 renders `LevelRows`
  from the same cards (`current_level` → held, `required_level` → asked,
  `next_practice_level` → the button).
- Steps 3–4 render as locked cards whose one action is "Find a job" →
  `/market` (§9 Q1).
- The no-rooms state opens this room instead of `NoRoomsDoor`.
- **Read:** `/career-skill-path` is already fetched by this screen
  (`skillPathQ`), so P1 adds no request.
- **Accept:** a person with a target role and no saved job lands in a room with
  four steps at 375px and 1536px; the Finlatics rail still lists all eleven.
- **Measure:** add `room_opened` to `CoreLoopStep` (surface `role` | `job`);
  people with `room_opened` per week against the 4 who can open a room today.

### P2 · Practice runs inside step 2 — both kinds of room

- `LevelRows`: the row's button opens `QuizRunner` in the row
  (`upskilling.startSet(skill_id, level)` → `submitSet`) instead of linking to
  `/practice?skill=`. One row open at a time.
- Passing a level writes `skill_assessed_level` (today's path), so every room's
  rung for that skill moves on the next ladder read; invalidate the ladder and
  `career-skill-path` queries on pass.
- `POST /upskilling/sets` takes an optional `job_id` (today: `skill_id`, `level`)
  and stores it on `quiz_attempts.job_id` (the column exists, 0 rows use it), so
  practice is attributable to a room.
- **Delete on the way past:** `DrillPanel` (the job calibration quiz, 0 uses
  ever) and its import of `startGap`/`submitGap` from the room. Keep the
  backend routes only if another caller exists; otherwise remove them in the
  same commit.
- **Accept:** clear L1 of a skill in one room; every other room asking for it
  shows L1 held without a reload of the page.
- **Measure:** `quiz_attempts` with a `job_id` or from the role room, per week;
  levels passed per person who opened a room.

### P3 · The offers in the room

- Render `PackOffer` under the step cards in both kinds of room (₹199 human
  review + 30-min call; ₹599 three calls). Same component the CV page uses, so
  a held check shows instead of a buy button.
- `billing_payments` records `job_id` but not where the order came from. Add
  `surface text` (additive migration, applied first), sent by
  `CreateOrderRequest` as `room` | `cv` | `pack`; a job room passes its `job_id`.
- **Measure:** orders with `surface = 'room'`.

### P4 · The rail: "Skills your rooms ask for" and all eleven programmes

- `prep_ladder_read` already computes each room's unmet levelled asks for
  `finlatics_match`. Return the aggregate as `asks`: skill · rooms asking ·
  highest level asked, deepest gap first. It is the same read: no new round trip.
- `SkillPathRail` is replaced by an `AsksRail` from `asks`; a row opens the
  room that asks it most at step 2 with that skill's row open.
- The training block lists all eleven (`shelfRows`), the matched ones with
  their `why`; `TrainingCard`'s three-plus-"All 11" goes.
- **Delete on the way past:** `skill-path-rail.tsx/.css`, the three-card
  fallback in `training-card.tsx`.

### P5 · Saved jobs get rooms — reach 89

- `prep-model.ts` `roomStage("saved")` → `"saved"`; `prep_ladder_read`
  `LIVE_STATUSES` adds `saved`. The read stays four round trips; the
  `job_skills` read grows with the room count (p90 5, max 66 saved).
- Collections rows for a saved job link to its room ("Prepare").
- Nav desc becomes "A room for every job you want"; the count is saved +
  applied + interviewing.
- **Accept:** saving a job on /market makes a room with four empty pips; apply
  moves it to `applied` without losing its steps.

### P6 · Step 1 carries the Gap Plan

- Job room step 1: `CoveragePanel` rows that are latent or shallow get the Gap
  Plan's move inline: "Put it on your CV" (`cv.rewriteBullet` →
  `cv.rewriteApply`, the existing no-fabrication path). Absent rows point at
  their step-2 row.
- **One component, two doors:** the CV builder's Gaps step and room step 1
  render the same `GapSession` card for the same job. The tailor flow keeps its
  step; there is no second planner.
- **Accept:** a latent requirement surfaced in the room shows in the tailored
  CV and counts as covered in step 1.

### P7 · The old pages stop being destinations

- One link builder, `lib/prep-href.ts`: `prepHref({ jobId?, skill?, step? })`.
  Every link into `/practice` and `/skills` (55 files today:
  `git grep -n '/practice\|/skills' frontend`) moves to it.
- `next.config.mjs` redirects: `/practice?skill=X` →
  `/preparations/role?step=2&skill=X`; `/practice?jobId=J` →
  `/preparations/J?step=2`; `/practice` and `/skills` → `/preparations/role`.
- Then delete the `/practice` and `/skills` pages and their CSS, and remove
  them from `robots.ts`, `phone-lab.ts` and `page-skeletons.tsx`.
- The Myro Score breakdown (`/skills` Score Map) folds into the target-role
  room's step 1 header: score ring + "what moves it" (§9 Q2).
- **Accept:** `npm run check:reach` green with no `/practice` or `/skills`
  route; every old URL lands on the matching room and step.

## 6 · Read path

The room's read stays `GET /preparations/ladder` (4 round trips, wave width 3) plus
`/career-skill-path` (already on this screen). P4 adds a field, not a read. P5
grows the `job_skills` payload with the room count; measure it on the account
with 66 saved jobs before shipping (playbook step 6, warm, 5 samples).

## 7 · Out of scope

- New drills for skills that have none (`has_drill = false`): the row says so
  and points at the Finlatics programme that covers it, as today.
- A rehearsal or brief for a role with no job (§9 Q1).
- Changing what Collections is: it stays the list of saved jobs.

## 8 · How we will know it worked

| Measure | Today | Read with |
|---|---:|---|
| People who opened a room, per week | ≤ 4 can | `core_loop_events` `room_opened` (P1) |
| People who passed a practice level, per 30 days | ≤ 3 practised | `quiz_attempts.passed` |
| Rooms with step 2 started | — | `prep_ladder` steps |
| Orders placed from a room | 0 | `billing_payments.surface = 'room'` (P3) |
| Saved → applied | 89 saved, 5 applied ever | `job_applications` |

## 9 · Questions for Shivam (recommendation first)

- **Q1 · Steps 3–4 in the target-role room.** Rehearsal and the brief are built
  from a job's requirements. *Recommended:* they show as locked with one button,
  "Find a job", until a job is saved. A role-level rehearsal would need new
  model spend and content nobody has measured demand for.
- **Q2 · The Myro Score breakdown.** `/skills` is the only full view of the
  score. *Recommended:* the score ring and "what moves it" become the head of
  the target-role room's step 1; the per-domain map goes.

## 10 · Status

| Chunk | State |
|---|---|
| P1 target-role room | not started |
| P2 practice in step 2 | not started |
| P3 offers in the room | not started |
| P4 rail: asks + all eleven | not started |
| P5 saved rooms | not started |
| P6 Gap Plan in step 1 | not started |
| P7 old pages retire | not started |
