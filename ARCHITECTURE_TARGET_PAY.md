# Target pay: the number a person is aiming for, next to the floor

**Architecture spec #65. Written 2026-11-25 by Claude from prod reads and a code
walk, at Shivam's ask** ("at least 35, a good number is 40 — save it for every
user, check the code covers it").

> **VERIFY IN CODE before building.** Line numbers are from `b7fa7ff5`. One chunk
> = one commit on `Develop`, six gates green, `git add` only your own files.
> No migration in this spec: every store it uses exists.

---

## 1 · What is true today, measured 2026-11-25

Myro's own accounts excluded (`is_test_account`).

| | Count |
|---|---:|
| Real users | 1,120 |
| …with a pay floor in `user_profiles.deal_breakers` | **0** |
| …with a `career_profile` row at all | **0** |
| …with `career_profile.data.expected_ctc_lpa` | **0** |
| Judged verdicts (`user_job_matches.recommendation`), weeks of 09-28 to 10-12 | 14,548 |
| …carrying a pay band (`ctc_high_lpa`) | 209 (1.4%) |
| Judged verdicts since 2026-11-09 | 1,936 |
| …carrying a pay band | **1** |
| …with `ctc_basis = 'stated'`, last 30 days | 0 |

The only account with a floor and an expected CTC is Shivam's own.

**What the code already does, for every user:**

- **Pay Floor.** A pay sentence in `deal_breakers` ("Pay floor ₹35 LPA", "less
  than 30 lakhs") is read as a number by `deal_breakers.pay_floor_lpa`
  (`backend/app/services/deal_breakers.py:45`). `read()` keeps the **highest**
  floor across lines (`:101`). The brain is told it (`llm_ranker.py:194`). The card
  says when an estimated band sits under it (`published_list.py:214`, `:277`,
  `below_floor` at `deal_breakers.py:106`). A floor never hides a job
  (Shivam, 2026-09-28).
- **Pay band.** Every full eval is asked for `ctc_lpa` as `[low, high]`
  (`llm_ranker.py:266`). It is parsed at `:511`. `_ctc_band` drops a single
  number (`:160`).
- **Expected CTC.** `career_profile.data.expected_ctc_lpa`
  (`backend/app/schemas/career_profile.py:31`). The extension fills it into
  application forms (`filing_answers.py:53`), and each save mirrors it into
  `user_memory` as prose. The CV builder card labels it "Expected fixed"
  (`frontend/components/cv/builder/career-profile-card.tsx:42`).
- **How a person states a floor.** In Pre-flight, a pay sentence typed under
  "Won't take" (`frontend/lib/preflight/slots.ts:47`) is refiled at read time as
  `pay_floor` with the note "read as your pay floor"
  (`preflight/normalise.py:114`). There is no labelled pay field.

**What is missing:**

1. **The band is almost never there.** No band means no "below floor" and no
   "reaches target". Anything built on pay is dead until this is fixed (§3, C0).
2. **No target.** The floor is the only pay number matching reads. A second pay
   sentence in `deal_breakers` cannot carry a target: `read()` takes the max, so
   "aiming for 40" would silently become a floor of 40.
3. **No one is asked.** The two ways in are a free-text "Won't take" line and a
   CV-builder card. Zero real users have used either.

## 2 · Decisions

**D1 · One number, already stored.** Target pay **is**
`career_profile.data.expected_ctc_lpa`. No new column. The extension's form fill,
the memory mirror and the card already read it. A second field for the same
number would drift from it. The floor stays where it is: the pay sentence in
`deal_breakers`.

**D2 · Target pay never goes to the brain.** Pay never makes a Skip (09-28), and
putting it in the prompt would move `eval_context_key`, which would re-read every
cached verdict for that person. Target is compared after judging,
deterministically, exactly as the floor is: `reaches_target = band_high >= target`.
It uses the top of the band for the same reason `below_floor` does — a band that
reaches the number is one the person can negotiate into.

**D3 · Order does not change in v1.** The brain's score orders the list. Pay is
shown on the card, not used to sort. Revisit only with a measured reason.

**D4 · Ask where people already are.** A labelled Pay group in Pre-flight, with
two lines: *At least* (writes the floor sentence) and *Aiming for* (writes
`expected_ctc_lpa`). The typed-pay refile in `normalise.py` stays for people who
type pay elsewhere.

## 3 · Chunks

**C0 · Why the band is missing — found and fixed 2026-11-25.** The brain
answers it; one of the two writers threw it away. Verdicts are written by the
batch persister (`llm_ranker.persist_matches`, `llm_rank` set) and by the
on-demand single-job write (`matching/on_demand._persist`, `llm_rank` NULL). They
hand-built separate row dicts, and the on-demand one never gained `ctc_*`,
`breaks`, `pick_reason`, `personalization`, `star_pointers` or `level_strategy`.

| Week | Batch verdicts with a band | On-demand verdicts with a band |
|---|---:|---:|
| 10-05 | 61 of 61 | 0 of 6,516 |
| 10-12 | 100 of 100 | 5 of 3,704 |
| 11-09 → 11-25 | — (no batch verdicts) | 1 of 1,936 |

From 11-09 every verdict came the on-demand way, so cards also lost
`pick_reason`, the one line written to the person. Fix: one
`llm_ranker.verdict_columns(ev)` used by both writers, with a test that the
on-demand row carries the whole verdict.
- No backfill. A verdict already written stays as it is. A job gains its band
  the next time it is judged (a new job, or a direction change that moves
  `eval_context_key`).
- **Done when** ≥ 70% of verdicts judged in the 7 days after `Develop` deploys
  carry a band. Query: `count(ctc_high_lpa)::float / count(recommendation)` on
  `user_job_matches` by `computed_at`. The batch path's 100% says the model
  answers almost always.

**C1 · `reaches_target` on the card.** `published_list` reads the person's
`expected_ctc_lpa` next to the floor at `:214`, and `_card` emits
`pay_reaches_target` beside `pay_below_floor`. `payView`
(`frontend/lib/jobs/card-view.ts:127`) gains `reachesTarget`. The card shows it
by design, not a new sentence (`/frontend-design`). The jobs list is a read path:
fold the `career_profile` read into the existing parallel reads, and record p50
before and after (`/read-path-perf`).

**C2 · Pay group in Pre-flight.** A `pay` slot in `SLOT_COPY` with two add kinds.
*At least* writes "Pay floor ₹N LPA" through `targeting_write`, replacing any
earlier pay sentence rather than adding one. *Aiming for* writes
`expected_ctc_lpa` through the same merge → validate → write → mirror as
`PATCH /career-profile`. Both numbers are optional. Aiming-for below at-least is
refused at the field.

**C3 · Relabel to total CTC** (Q1, decided). The CV-builder field becomes
"Expected CTC" (`career-profile-card.tsx:42`). The memory mirror's sentence in
`repositories/career_profile.py` changes from "expected fixed compensation" to
"expected CTC". The schema docstring follows. The stored key
`expected_ctc_lpa` keeps its name, so no data moves.

Not in this spec: **Settings cannot change role families.**
`UpdateProfileRequest` (`schemas/users.py`) has no `role_families`, so a title
edit there keeps the old families (by design in `targeting_write.derive`). Only
onboarding, Pre-flight and the role picker move them. Found while updating
Shivam's own targets. It is separate work.

## 4 · Reach

The door is Pre-flight. Before C2 ships, count real users who opened Pre-flight
in the last 30 days and write that number here. If it is under 20, the door is
on a path nobody walks: put it on the onboarding direction step instead, and say
so in this file.

No backfill. People with an `expected_ctc_lpa` get `reaches_target` the next
time their list renders, because the number is read at render time. No one is
asked again while they are away.

## 5 · Open for Shivam

- **Q1 · decided 2026-11-25: total CTC.** "Aiming for" is a total-CTC number,
  the same basis as the bands. C3 relabels the field.
- **Q2.** Confirm that pay stays off the sort order in v1 (D3).
