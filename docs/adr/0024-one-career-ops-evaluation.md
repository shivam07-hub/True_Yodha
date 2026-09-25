# One Career Ops evaluation per job, and the direction decides who sees it

**Status:** Accepted
**Date:** 2026-09-17
**Related:** ADR-0022 (closeness, not buckets) · ADR-0016 (no fabrication) · ADR-0005 (what Myro is not) · CONTEXT.md §Match Verdict, §CandidatePool, §Targeting Brief

## Context

Myro's recommendation is the career-ops method (`career-ops-hq/career-ops`, MIT)
running on Myro's own verified corpus. Only its evaluation prompt was ported;
the rest of its loop was not, and the platform drifted around the gap.

Measured 2026-09-11, on the 123 users whose target is a real direction:

- **1 of their 19 picks** was in that direction, against ~1,242 live jobs in it.
- The **/market warm wrote 86% of all verdicts** and ranked mostly on skill
  overlap, so **2%** of what it rated was on direction. A Search run managed 12%.
- Agent Picks took **any** verdict at 3.5 with an Apply, from whichever path
  wrote it, with no direction check: **7 of 130** "Apply" verdicts were on target.
- **13 of 30** pick reasons called the reader "the candidate". `star_pointers`
  was empty on all 30.
- **10 of 194** skips carried a reason, and no code read one.

A CV with SQL on it was enough to recommend a Data Engineer role to someone
aiming at sales. Past work qualifies a person; it does not say where they are going.

## Decision

**One evaluation per (user, job), one writer, one reader, one bar.**

1. **Direction is context the model judges, not a grade injected as the answer.**
   Aspirations name which live jobs are opened. The published fit is the
   evaluation's score (ADR-0022, amended 2026-09-26). Past skills qualify;
   they never set direction. The prompt is not handed a precomputed skill
   grade and told to treat it as the fit.
2. **Apply means 4.0**, as upstream career-ops does, for picks. The feed keeps
   3.5 for its verdict word.
3. **A thin band is topped up with reach, and reach is on-direction only.** The
   4.0 bar alone took bands from 24 users to 6; filling with off-direction roles
   would hand back the problem the bar exists to fix.
4. **The reason is written to the reader** (`pick_reason`, second person, gated
   by `reader_voice`). The evaluator's internal `summary` is not shown.
5. **Every surface reads that one record.** The ring is the only statement of how
   good a match is; the drawer explains, and never re-judges.
6. **What the user rejects is read back.** Two "Not my role" skips in one
   direction stop it being picked — never a direction the user chose, never a
   skill (`matching/passed_on`).
7. **Prompt changes are versioned into the staleness key**, so verdicts re-rate
   on the user's next Search. Nothing is backfilled.

## Consequences

- A user with no on-direction role at 4.0 sees a shorter band, not a padded one.
  An empty band says so instead of promising a hand-vetted shortlist.
- Re-rating costs model spend on the judgment lane, bounded to what each user
  searches. Accepted (Shivam, 2026-09-16).
- Blocks the ported prompt does not yet write — pay research (D) and interview
  prep (F) — stay where they already live. Pay follows ADR-0005 item 7 as
  amended: shown from a source, never estimated.
- career-ops stays unvendored. Porting mode text keeps its MIT notice, and
  portal scanning stays in the crawler repo (ADR-0001).
