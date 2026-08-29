# Job Tracks — shipped, and the outage it was hiding

**Written 2026-08-28. Every slice shipped 2026-08-29.** Nothing here is open
work. Kept as the record of what was built and why; the invariants live in
[CONTEXT.md](CONTEXT.md) §Pre-flight Order and §Provisional Match.

⚠️ **The gate was dead for the whole feature's life.** `tailored_cv_created_at`
had one writer — `POST /onboarding/milestones/{milestone}` — and NOTHING called
it: zero callers in the client, none on the server. It was NULL for all 141
users with onboarding state while 11 of them held 66 tailored `cv_versions`
rows, so `can_open_another` refused everybody: `POST /tracks` 409'd for every
user alive, the mentor's track proposal could never fire, and the grouped feed
could never render. **Slices 1, 2 and 3a were all unreachable in production and
nothing said so.** Fixed by stamping it in `CVVersionsRepository.create()` —
the one seam every version passes through, chosen precisely because a stamp any
of eighteen call sites can forget is how it died the first time. No backfill:
the 11 flip their gate on their next tailor.

**Slice 2 is done and its section below is kept as the record of what was
built, not as work.** The mentor extracts `second_search`, `from_utterance`
emits one proposal for it behind the `/tracks` gate, and the yes goes to
`POST /tracks` rather than `/order/apply` — the apply loop acts on add and drop
only, so an `open_track` reaching it is inert, and there is a test holding that
loop to it. Invariants and vocabulary now live in [CONTEXT.md](CONTEXT.md)
§Pre-flight Order.

**Slice 3a and 3c ARE built.** `track_id` now rides the feed read
(`_MATCH_EVAL_BADGE_COLS` → `_rank_feed_rows` → `JobFeedItem`), the ranked head
is grouped by search server-side, and `lib/jobs/track-sections.ts` marks each
search and the read/unread boundary inside it using the divider the feed already
had. Desktop, `MobileFeed` and `mobile/redesign/jobs-surface` all render them. A
single-track user gets nothing at all — no header, no tier line, the screen it
was. The hero rail names one best match per search rather than one across all of
them.

**Slice 3b IS built.** The offer lives on the tailor's done panel
(`components/cv/builder/tailor-done.tsx`) — the moment the loop closes, which is
also the moment the server flips the gate, so the panel re-reads it on apply
rather than showing the offer one tailor late. It does not create a track: it
opens Myro Search on the say band, where the mentor turns "I'm also looking at
marketing" into the one typed proposal slice 2 built. A track is the user's own
words or it is nothing. It retires itself once they have a second search
(`tracks.length < 2`) — a success screen that keeps selling reads as one that
wanted something.

`useTracks` still does not re-export `blocked_reason`: nothing renders a refusal
yet, and when something does it must render THAT STRING — never a padlock,
never "Pro", never "locked".

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

## Slice 2 — the mentor proposes a track · **SHIPPED `4b161ecc`**

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

### 3a. Results, grouped by search · **SHIPPED**

A run now returns up to `TRACK_QUOTA = 20` per track (`jobs_workflow.py`), each
row carrying `track_id`. Group by it, label each group with the track's own
words.

**How it was answered.** Shivam's call: keep the 20/8 split and name the tier,
with minimal words — "design over words". So there is no sentence. The tier is a
DIVIDER, the same element the feed already used to say "the verdicts stop here
and that is on purpose", carrying three words: *Not read yet*. A search's own
name is the louder version of the same element. Two boundaries, one component,
told apart by weight rather than by copy. And a row the brain has not read now
prints no verdict word at all — `verdictLabel` returns null for `checking` — so
the card cannot contradict the divider above it.

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

### 3b. The unlock moment · **SHIPPED**

`can_open` flips to true the moment the user tailors a CV for a job in their
first search. That is the moment to offer the second one — they have just felt
the whole loop close and know what a search is *for*. Before that moment, do not
advertise it.

### 3c. What a single-track user sees · **SHIPPED**

One group, or no grouping chrome at all. Their screen should look like it did
before tracks existed.

---

## Feedback from the screenshot you sent · **all three closed**

Real defects visible in that one frame. Two are yours, one was mine.

1. **`Below less than 30 lakhs` — fixed, `815beaef`.** Not a render bug: the
   resolver prefixed `"Below "` onto pay-floor text, and that text was written
   into `user_profiles.deal_breakers` and re-imported as a second line on the
   next open. The order held both `"less than 30 lakhs"` and `"Below less than
   30 lakhs"`. Cumulative — the next run would have added another "Below". The
   prefix also restated the plate's own eyebrow (PAY FLOOR). Nothing to do on
   your side; noting it so you don't design around the old string.

2. **"37 lines you said no to — all dropped."** — **fixed, `4b161ecc`.** You
   read it right: the generator was spraying. `guesses_from` turned every
   `constraint` / `work_mode` / `preference` fact into a question and
   `brief.facts` is uncapped (the 8-fact cap in `targeting` is the ranking
   prompt's), so 66 notes became about forty questions. It was an arity problem
   rather than a taste one — twenty questions into a slot that holds six
   guarantees fourteen rejections whatever the user wants — so the cap is now
   `SLOT_ARITY`, ranked by whether the distiller filed the note twice, and it
   behaves as a queue: a rejected guess stays rejected and the next open
   surfaces the next-strongest. The sentence itself was left alone; it was
   never the problem.

3. **The say-band placeholder overlapped by an extension's icons** (Grammarly)
   — **fixed, `4b161ecc`.** `--say-gutter` reserves a 30px lane on the right of
   every SayPad host and moves our own character counter out of it. We cannot
   style the injected control, cannot predict which tool it is, and disabling it
   (`data-gramm="false"`) would be switching off the user's own tool on their
   own words.

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
