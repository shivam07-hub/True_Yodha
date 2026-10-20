# The /market List Is Read Until It Is Full, Through One Career-Ops Triage

**Status:** Accepted — triage built; the first replay failed the gate (2026-10-20), so nothing reads real piles with it
**Date:** 2026-10-20
**Related:** ADR-0022 (closeness, not buckets), ADR-0024 (one career-ops evaluation per job), CONTEXT.md §List Reading, §Verdict Currency, §CandidatePool, §Match Run

## Decision

A person's /market pile is read in **rounds** until their list is full, and every pile reader goes through the same rounds (Shivam, 2026-10-20).

1. **A round** is the next 50 unread jobs of the pile, freshest first. One career-ops triage call reads all 50. Only the jobs triage keeps get the full career-ops evaluation. The evaluation itself is unchanged: one per (person, job), ADR-0024.
2. **Triage sees the Targeting Brief** the evaluation sees — one rendering, `llm_ranker.candidate_brief`: target roles, places, career goal, superpower, won't-take lines, pay floor, remembered facts, the CV. It never sees an overlap number or the matched-skill list. Skills qualify a job; they never decide which jobs the judge reads.
3. **Reading stops when the list is full:** 40 jobs at or above 3.5 (`published_list.py`: `SHOW_FLOOR`, `_FULL`). The rest of the pile stays unread until the person asks for more. **Read more** resumes rounds. The list says how much of the pile is read, so nothing stops silently.
4. **A job triage passes over is recorded** against (person, job, eval context): read, not a fit. The count of unread jobs then ends, and Read more skips it. A change to the CV, the facts, the direction or the prompt re-opens it, the same way it re-opens a verdict.
5. **After a change, the cards already on the list are read first** (Verdict Currency), then rounds continue only until the list is full again.
6. **Every pile reader goes through it:** the /market drain, Match Run, the Return door and Read more. Opening one job (`on_demand.py`, brain-on-open) stays outside: the person asked for that job.
7. **No real pile is read this way until a replay passes.** `triage_replay.py` runs the triage over piles the full evaluation already judged. It must keep at least 90% of the jobs that cleared 3.5. Below that, the triage changes before anything else does.

## Why

Measured on production, 2026-10-20, 24 real people (own accounts excluded), 13,580 full evaluations:

- The drain (`feed_warm.py`) judged every aspiration-matched job: up to 1,000 per person (`ASPIRATION_READ`), one evaluation each, in the order listings were last verified. Every CV save or new fact put the whole pile up again. One person reached about 1,350 evaluations in a day.
- **84% of evaluations 8–30 days old were never shown to anyone.** Of the ones that scored 3.5 or more, 4% were shown.
- **Scores fall on five values** (2.8 / 3.2 / 3.8 / 4.2 / 4.8). Between 36 and 642 jobs tie at whatever score holds the 40th place, so "the best 40 of 1,000" is mostly a tie-break on `job_id`.
- **Stopping at 40 alone**, freshest first, would have cut evaluations from 13,580 to 7,177 (−47%).
- **Skill overlap is not the filter.** It correlates with the judge's score at 0.44, and keeping 87% of a person's top 40 would still mean judging the top 500 by overlap. That is why the round is triaged by the career-ops judge, not cut by overlap.

## Replay, 2026-10-20 — fails the gate

`triage_replay.py`, keep at most 15 per round of 50, judgment lane:

| Answer key | People | Good jobs | Recall | Precision | Triage calls |
|---|---|---|---|---|---|
| Every stored verdict, 500 freshest per person | 4 | 253 | 45.5% | 34.3% | 40 |
| Only verdicts current for today's brief | 4 | 154 | 37.0% (42.9% without the one round the provider failed) | 81.4% | 8 |

The current key is the honest one: three of the four largest piles had no verdict written under the brief the person has today, and the stale key's 34% precision is mostly that drift. Against it, the triage is precise but keeps too few: 81% of what it keeps clears 3.5, yet it keeps under half of the good jobs and stays below its own cap (30 of 45 on the richest pile). Its instruction, not the cap, makes it strict.

The replay also showed the judgment lane's first model, `nvidia/nemotron-3-super-120b-a12b:free`, failing on every call (`NotFoundError` here, "returned empty response" in the worker's logs on 2026-10-19), so production judgment runs on the next, paid tier after a wasted hop.

## Considered Options

- **Keep judging the whole pile.** Rejected: most of the spend is on evaluations nobody sees, and the coarse scores mean the extra reading barely changes the list.
- **Order the pile by skill overlap and stop at 40.** Measured −66%. Rejected (Shivam): it lets overlap decide which jobs the judge reads, which ADR-0022 and ADR-0024 already rejected for direction.
- **Freshest first, stop at 40, no triage.** Measured −47%. Rejected as the end state in favour of the career-ops triage, which Match Run already runs (`llm_ranker.triage_shortlist`); kept as the fallback if the replay fails.
- **Record a passed-over job as a verdict row with no score.** Rejected: every reader treats a null score as "checking", so the marker would leak onto cards.

## Consequences

- A person sees a list once 40 good jobs are found, not after the whole pile is read. With triage, fewer evaluations are spent per good job found.
- Triage becomes a judgment step that can drop a good job. The replay gate (point 7) is the guard, and the recorded pass is re-opened on every change of what the brain is told.
- The drain's "does not stop at a silent cap" rule is replaced by a visible stop and Read more.
- Not built yet: the pass record (needs a migration), the rounds module, the switch of every pile reader, the Read more control.
