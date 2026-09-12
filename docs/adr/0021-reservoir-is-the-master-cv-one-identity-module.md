# The Career Story Reservoir Is the Master CV — and One Module Decides Story Identity

**Status:** Accepted
**Date:** 2026-09-12
**Related:** ADR-0008 (durable background work), ADR-0016 (no fabrication), CONTEXT.md §Career Story Reservoir

## Decision

The Career Story Reservoir supersedes the positional `cv_points` master as the **one place** a
user's career lives: every document, dump, LinkedIn export, tailored rewrite and interview
answer they ever produce lands there and stays current, and every tailored CV is a projection
of it. Users stop keeping one CV per job in Drive and Canva (Shivam, 2026-09-12 — "Delta-4").

That only holds if **one real achievement is one story** carrying every phrasing of it. Story
identity is therefore decided in exactly one module, `story_identity`, for every inflow source:

- **Same achievement** = the same work with the same outcome, said differently. **A part of a
  larger piece of work is its own story** — a CV can carry both lines.
- **Similarity only nominates.** Candidates are pairs above 0.60 that share an employer family,
  are each other's nearest neighbour, involve a role-less story, or share a title.
- **Near-verbatim folds unjudged** (the same document twice). Everything else goes to one batched
  strong-model judge: `same` → fold · `part_of` / `unsure` → the user rules · `different` → kept.
- **A failed judge call records nothing**, so the pair is judged again — never stamped "different".
- **A user ruling is law**, enforced in SQL. A fold is archive-only, applied in one transaction,
  and records exactly what it added so it can be undone exactly.
- It runs after every ingest and lazily when the user opens Stories.

## Considered Options

- **Tune the cosine threshold.** Rejected on measurement (2026-09-12, 211 active stories): true
  duplicates scored 0.54–0.77, the median story's nearest neighbour scored 0.705, and two
  different schools scored 0.848. No threshold separates them; cosine cannot decide sameness.
- **Decide identity only at ingest, against existing stories.** This was the old design. The
  rules changed three times *during* the one real bulk ingest (2026-07-13, 20:45–22:49 IST, fold
  rules landing at 21:14/21:20/21:26) and nothing ever re-examined a written story. A sweep over
  the existing set is the only way identity stays true as rules and sources change.
- **Ask the user about every borderline pair.** Rejected as the default: the equivalent role
  merge cards have been answered zero times. The user is asked only when the judge sees one
  story as part of the other, or cannot tell.

## Consequences

- The onboarding CV still writes positional `cv_points` and does not reach the reservoir.
  Routing it in is the next step, and identity had to hold first — otherwise every re-upload
  and tailored copy becomes a pile of near-duplicate stories.
- `career_projection` has no duplicate guard of its own; it relies on this invariant.
