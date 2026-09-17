# Myro Never Fabricates CV Content — It Asks

**Status:** Accepted
**Date:** 2026-06-05
**Related:** ADR-0005 (what Myro is not), MYRO_TUTOR_DESIGN.md

> **Renamed 2026-09-17.** "Myro Tutor" is **Myro Mentor**: `services/mentor.py`,
> `mentor_grounding.py`, `mentor_retriever.py`, `mentor_learn.py`, and the live
> design doc [MYRO_MENTOR.md](../../MYRO_MENTOR.md) at the repo root. The word
> "tutor" appears nowhere in the code. `MYRO_TUTOR_DESIGN.md`, cited below as
> Related, does not exist and has not for some time — the decision stands, its
> pointer did not.


## Decision

A **hard, blocking no-fabrication rule** constrains the CV rewrite tool. Myro never invents
metrics, numbers, titles, dates, employers, or achievements. The XYZ rewrite may only *reframe
what the user actually supplies.* When a bullet lacks a metric, Myro **asks** for the real one
("What was the impact — %, ₹, time saved, users?"). If the user has none, Myro reframes
qualitatively; it never fills in a number.

Supporting rules: missing JD keywords are surfaced as **"add only if true"** (no keyword
stuffing); career claims **cite the shelf** (provenance); Myro stays **in scope** (career/CV/
skill/practice) and declines off-domain asks; it **admits uncertainty** rather than confabulating.

## Considered Options

- **Auto-fill metrics / propose a placeholder like "[X%]":** rejected — even a placeholder nudges
  invented numbers onto a real resume going to a real hiring manager; one fabricated metric =
  rescinded offer + destroyed trust. The integrity risk is existential for the wedge.
- **Soft "suggestion" framing with invented examples:** rejected — users paste suggestions
  verbatim; the example becomes the lie.
- **Ask-don't-invent (blocking):** accepted — keeps the CV truthful, *is* the Socratic
  ask-before-tell pedagogy doing real work, and extracts the user's real, specific wins they
  forgot to mention (better bullets *and* honest ones).
