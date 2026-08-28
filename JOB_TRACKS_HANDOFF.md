# Job Tracks — handoff for slices 2 and 3

**Written 2026-08-28.** Slice 1 is shipped on `Develop`. This is the brief for
the mentor proposal (slice 2) and the screens (slice 3). Read it before
touching either — several of the constraints below are decisions that were
already argued and settled, and a design that quietly reverses one will be
reverted.

---

## What a track is

A user runs more than one job search. "15-20 consulting and 15-20 marketing" is
two searches, two CVs, two sets of applications — not one list sorted into two
piles.

**Track 1 is the profile.** It has no row, no id, no migration. Its role words
are `user_profiles.target_role_titles` and its matches carry `track_id IS NULL`.
A stored `job_tracks` row exists only for a second or third search someone
deliberately opened.

**Why that matters to you:** 88 of 106 users with a target set exactly one role
title, and of the 18 who set more, almost all are one intent said three ways
("Software Engineer / Full Stack Engineer / Frontend Engineer"). **Roughly five
in six users will never have a second track.** Every screen you design must
look correct, complete and unremarkable for them. If a single-track user can
tell that tracks exist, the design is wrong.

**A track is the user's own words, never a taxonomy key.** This was tested
against real data: 40 hand-verified matches for one candidate spread across
**31 distinct `role_family` values**, only 11 of them in the eight a human would
call consulting or marketing. A product-marketing role at a crypto exchange is
filed `Cryptocurrency`; a field-marketing one, `Safety and Security`. Do not
build any grouping, filter, icon or colour off `role_family` or `career_band`.
What separates the tracks is the triage brain reading titles and JDs.

---

## Shipped already — do not rebuild

| Commit | What |
|---|---|
| `c95f79a3` | `job_tracks` table, `user_job_matches.track_id`, `app/services/job_tracks.py` (invariants + the unlock gate) |
| `2b5f1650` | Per-track triage in the run; `track_id` stamped through persistence; recommended slots counted per track |
| `4642fe98` | `/tracks` — GET / POST / PATCH / DELETE |
| `815beaef` | Unrelated but in your screen: the pay-floor display bug (see Feedback below) |

### The API you build against

```
GET    /tracks              -> { tracks[], can_open, blocked_reason, max_tracks }
POST   /tracks              -> 201, or 409 with blocked_reason
PATCH  /tracks/{id}         -> rename / re-word
DELETE /tracks/{id}         -> archive; position frees up
```

`tracks[0]` is always the profile track: `id: null`, `is_profile: true`,
`position: 1`, labelled with the user's first role word (or `"Your search"`
when they have none).

`can_open` is `false` until the user's first search has produced a tailored CV
(`tailored_cv_created_at`). `blocked_reason` is the next step, in words —
`"Tailor a CV for a job in this search first."` **Render the reason. Never
render a padlock, "Pro", "coming soon", or the word "locked".** There is a test
asserting the string never contains "lock"; do not make the UI say what the API
refuses to.

---

## Slice 2 — the mentor proposes a track

### Where, exactly

Your screenshot is the right place. The seam is:

```
say-band.tsx  (the "SOMETHING OFF?" band)
  -> POST /preflight/proposals   { utterance }        backend/app/routers/preflight.py:426
  -> mentor.converse(surface="job_intent", extract=True)
  -> proposal_engine.from_utterance(turn.proposals, order)
  -> typed proposals the user answers ONE AT A TIME
  -> POST /preflight/order/apply
```

A chip (`the work` / `the place` / `the level` / `the pay`) goes to
`proposals.from_topic` — a deterministic table, no LLM turn, free and instant.
Free text goes to the mentor.

### What to add

When the utterance names two distinct searches — "15-20 consulting and 15-20
marketing", "I'm looking at both product and strategy roles" — the mentor should
extract a **second track** as one typed proposal, answered like any other line.

Constraints:

- **Propose, never create.** `/preflight/proposals` proposes only; nothing
  touches the order until `/order/apply`. A track must not appear because
  someone typed a sentence.
- **One question at a time.** The band's own copy says *"one thing at a time
  works best"*. A track proposal is one question: *"Marketing sounds like a
  second search — open one?"* Not a form.
- **Respect the gate.** If `can_open` is false, do not propose a track at all.
  Proposing something the server will 409 is worse than not offering it.
- **Do not add a fifth chip** for it. The chips are named topics answered by a
  deterministic table with no model call; a second search is not a topic and
  cannot be answered deterministically. It belongs in the free-text path.

---

## Slice 3 — the screens

### 3a. Results, grouped by search

A run now returns up to `TRACK_QUOTA = 20` per track (`jobs_workflow.py`), each
row carrying `track_id`. Group by it, label each group with the track's own
words.

**The two tiers are the hard part.** Only `TRACK_DEEP = 8` rows per track get
the full Career Ops verdict (grade, application angle, strengths, concerns,
five axes). The rest ship as real matches with an overlap score and no verdict
yet — the read seam already renders that as `verdict == "checking"` and upgrades
in place when the row is opened.

So one group has ~8 rich rows and ~12 thinner ones. **Make that read as
deliberate.** It is not a loading state and it is not a broken card: those rows
are real jobs that have not been deeply read yet. If your design needs every row
to look identical, say so and we will change the split rather than have the
screen lie about it. Do not fake a verdict to fill the space.

This split is the entire reason two searches cost about what one does — 16 deep
evaluations against the 15 a single-track run does today. It is not negotiable
without a latency conversation.

### 3b. The unlock moment

`can_open` flips to true the moment the user tailors a CV for a job in their
first search. That is the moment to offer the second one — they have just felt
the whole loop close and know what a search is *for*. Before that moment, do not
advertise it.

### 3c. What a single-track user sees

One group, or no grouping chrome at all. Their screen should look like it did
before tracks existed.

---

## Feedback from the screenshot you sent

Real defects visible in that one frame. Two are yours, one was mine.

1. **`Below less than 30 lakhs` — fixed, `815beaef`.** Not a render bug: the
   resolver prefixed `"Below "` onto pay-floor text, and that text was written
   into `user_profiles.deal_breakers` and re-imported as a second line on the
   next open. The order held both `"less than 30 lakhs"` and `"Below less than
   30 lakhs"`. Cumulative — the next run would have added another "Below". The
   prefix also restated the plate's own eyebrow (PAY FLOOR). Nothing to do on
   your side; noting it so you don't design around the old string.

2. **"37 lines you said no to — all dropped. Myro runs on the 11 lines above
   and nothing else."** Verified against prod: that order really does hold 53
   lines. Thirty-seven rejections against eleven kept means the guess generator
   is spraying, and the summary line is doing the work of admitting it. The
   sentence itself is good and honest — the ratio behind it is the problem.
   Worth a look at what is being proposed, not at how it is worded.

3. **The say-band placeholder is being overlapped by a browser extension's
   icons** (Grammarly). Not our bug, but the input's right padding leaves no
   room for the extension affordance every writing tool injects. Cheap to make
   robust.

---

## Invariants — a change that breaks one of these will be reverted

- A single-track user's run and screen are byte-identical to before tracks
  existed. `_track_specs` returns `()` for them; there is a test.
- A job appears in **exactly one** track. `user_job_matches` is keyed
  `(user_id, job_id)` so every job is brain-evaluated once, ever. Two tracks
  claiming one job would need two rows and would pay the model twice for the
  one that can exist.
- Quotas are ceilings over real listings. Padding means ranking real jobs lower,
  never widening a taxonomy net and never inventing a row.
- Track 1 is never a `job_tracks` row.
- Nothing about a track is derived from `role_family` or `career_band`.

## Before you say done

```bash
pytest backend/tests && ruff check <your files>
cd frontend && npx tsc --noEmit && npm run lint && npm test
npm run check:ui-drift && npm run build
```

Design rules that apply here specifically: `ANTI_SLOP.md`, and the two that bite
this screen hardest — if the UI already shows a state, don't add text saying it;
and ≤3 common words per label.
