# PRD — The Gold-Standard CV Scoring Contract

> Opened 2026-09-18. Backlog: #47–#54.
> Origin: one CV built end-to-end for a real JD (Amazon Sr. PM, RoW ATS Tech)
> against a live account, v111 → v116. It reached 18 bullets, 18 of them
> outcome-led, verified to one page. **Not one step of that was reachable from
> the product.** This PRD is the contract that makes it reachable.

---

## Problem Statement

A user uploads a CV, tailors it to a job, sees a score out of 100, fixes what the
rail tells them to fix, and downloads it. They believe they are done.

They are not, and the product cannot tell them so.

The rail's heaviest check is labelled **"Unquantified impact"** and carries the
largest penalty in the system. It does not test for impact. It tests whether the
line contains a digit. A bullet reading *"Authored the Robotics in Life Sciences
2030 point of view"* passes it — on the year. *"Built a five-level maturity
framework"* passes it — on a count of framework levels. Neither says what changed.

Measured on the CV that prompted this work: at its weakest draft the product's own
engine passed **13 of 13** bullets. An outcome-led review passed **4 of 13**. The
same defect is already sitting in the reservoir: of **2,254 banked CV points across
201 users**, only **29.1%** contain a number at all, and the product would wave
most of the rest through.

The user is therefore told a badly-written CV is finished. They apply with it.

Separately, the product cannot see problems that a careful human catches in
seconds — a CV claiming a city the job is not in, a header title no employment
record supports, two roles overlapping with nothing marking them concurrent, the
same revenue figure restated three times so it reads as three wins, a course about
to be listed as a certification, a relative period ("in 10 months") that went stale
when the role passed sixteen. Each of those was live on the CV that prompted this,
and each is a deterministic comparison over data already stored.

And the single number they are given blends two unrelated questions. A CV that
covers the job perfectly but reads poorly, and one that reads beautifully but
misses the job, can score the same. The user cannot tell which half is broken.

## Solution

**Two numbers, and two nudges.**

The CV page shows **Match** — does this CV fit this job — and **Quality** — is this
CV well written. They move independently, and each is explained by its own rail.
Match keeps its present meaning: coverage of the JD's real requirements. Quality is
new, and is where the gold standard lives.

Quality distinguishes two different failures and says two different things:

- A line with **no number at all** keeps today's cheap nudge: *put a number on this
  line*.
- A line whose number only describes **how big the thing was** — a team size, a
  count of levels, a year, an inventory total — gets a different message: *this says
  how big it was, not what changed*.

That second message is the product. It is the difference between a CV that is clean
and a CV that survives a screen, and no competitor is saying it.

Alongside the writing checks, Quality runs **nine deterministic screens** — no
model, mostly string and date comparisons over data the platform already holds —
that catch the errors a careful reader catches: location mismatch, unsupported
header title, unmarked overlapping roles, a figure restated as if it were several,
a figure that contradicts an earlier version of the same CV, the same achievement
written under two roles, a course presented as a certification, a stale relative
period, and a JD term the CV never answers.

Finally, the one-page verdict stops being a guess. Today it is a constant-width
line-count model that was measured wrong in both directions in a single session —
reporting 54% against a true 62%, and 110% ("spills onto 2 pages") against a CV
that genuinely fits at 97%. It currently **blocks the download** on that verdict.

## User Stories

1. As a user tailoring a CV, I want to see how well it fits the job separately from how well it is written, so that I know which of the two to work on.
2. As a user, I want a bullet that contains no number to be flagged, so that I know where to add evidence.
3. As a user, I want a bullet whose number only describes scale to be flagged differently, so that I learn the difference between how big something was and what it changed.
4. As a user, I want the flag to quote my own line back to me, so that I can find it without hunting.
5. As a user, I want to understand why a line was flagged without reading documentation, so that I can act on it immediately.
6. As a user who disagrees with a flag, I want to dismiss it without it returning, so that the rail reflects my judgement.
7. As a user, I want my Quality number to rise when I actually improve a line, so that the number is honest feedback rather than decoration.
8. As a user, I want the Quality number to be explainable row by row, so that I never see a score I cannot account for.
9. As a user applying to a job in a city my CV does not mention, I want to be warned before I submit, so that I am not filtered out before a human reads it.
10. As a user whose header claims a job title none of my roles carry, I want that flagged, so that I do not walk into an interview defending it.
11. As a user with two roles that overlap in time, I want to be prompted to mark one concurrent, so that the overlap reads as deliberate rather than careless.
12. As a user who has written the same figure into three bullets, I want to be told it reads as three separate wins, so that I can consolidate it honestly.
13. As a user whose number contradicts an earlier version of my own CV, I want to be shown both, so that I can decide which is right.
14. As a user who has described one achievement under two different roles, I want the duplicate surfaced, so that I can merge them.
15. As a user about to list a course under Certifications, I want the distinction explained, so that I do not make a claim an employer will verify and find false.
16. As a user with a relative period on a bullet ("in 10 months") for a role I have now held far longer, I want it flagged as stale, so that the figure stays true.
17. As a user tailoring to a JD that names a requirement my CV never addresses, I want to be told which words are missing, so that I can answer them or knowingly concede them.
18. As a user, I want to know whether my CV genuinely fits one page, so that I am not surprised by a second page after I submit it.
19. As a user whose CV does fit one page, I want the download to work, so that a wrong estimate never blocks me.
20. As a user whose CV genuinely spills, I want an honest warning and help trimming, so that I can fix it before applying.
21. As a user, I want the one-page verdict to count every section of my CV, so that adding a projects or achievements section changes the answer.
22. As a signed-in user, I want the same one-page verdict an anonymous visitor gets, so that signing in does not make the product worse.
23. As a user, I want the trimming suggestions to agree with the verdict that triggered them, so that the two do not contradict each other.
24. As a user whose CV was silently damaged by an earlier rewrite, I want to be shown what was removed, so that I can take it back.
25. As a user, I want a section I wrote to survive every future rewrite, so that I do not have to re-check my own CV after every edit.
26. As a user, I want to be told if my CV has lost a section since the version I last downloaded, so that I do not apply with a degraded document.
27. As a user, I want to be able to restore content from any earlier version of my CV, so that recovery does not require support.
28. As a user with advisory, founder or concurrent work, I want a section that does not call it a "project", so that it is not demoted on the page.
29. As a user, I want to name my own sections, so that the CV reflects how my career is actually shaped.
30. As a user with achievements, leadership roles or coursework, I want somewhere to put them, so that the strongest evidence I have is not left out of the document.
31. As a user on a laptop, I want to add a role or a section, so that I am not forced onto a phone to do it.
32. As a user on a phone, I want to reorder sections, so that I am not forced onto a laptop to do it.
33. As a user, I want an edit I make on any device to land on the document I am editing, so that a tailored CV is not silently changed through the master.
34. As a user with a CV point banked in the reservoir, I want it re-checked against the new standard, so that work I have already done benefits from the improvement.
35. As a returning user, I want that re-check to show on the surface I open, so that the improvement is something I am told about rather than something that happens invisibly.
36. As a user who has never returned, I want nothing recomputed on my behalf, so that the platform spends nothing on me until I am there.
37. As a user, I want the Quality number to use the same vocabulary as the rail, so that the score and the advice are obviously the same system.
38. As a recruiter-facing user, I want my CV verified for internal contradictions before I send it, so that I am not caught out by my own document.
39. As a user, I want screens that need the job description to run only when I am tailoring, so that my master CV is not flagged for failing to match a job I have not chosen.
40. As a user, I want none of these checks to send my CV to a model, so that the checks are instant and my data stays put.
41. As an agent working on this codebase, I want one definition of the one-page calculation, so that I do not fix a bug in a copy that is not the one users see.
42. As an agent, I want the retired estimate code deleted rather than left beside its replacement, so that I do not build on the wrong one.

## Implementation Decisions

**Two scores, one existing seam.** The match calculation already takes a content
penalty as a separate input and blends nothing else. Quality becomes its own score
computed from the same findings pipeline rather than a second blend. Match's
definition does not change. The header gains a second number; the rails beneath it
are unchanged in structure.

**Two writing checks, deliberately separate.** The existing digit-presence check is
kept as-is for the cheap case (a line with no number). A new classifier answers a
different question — does this number describe a result or a size — and is a
separate module with its own findings category, its own message and its own weight.
Widening the existing regex was rejected: the two failures need two different things
said to the user, and the existing check is already the largest single rule in its
file.

**The classifier is deterministic and local.** It works from the shape of the
sentence — change verbs, before-and-after pairs, a quantity attached to a result
versus a quantity attached to a countable noun, bare years, and known scope patterns
(team sizes, counts of levels, inventory totals). No model call. A number it cannot
classify is treated as an outcome, not a failure: a false "this is not impact" costs
the user's trust in the whole rail, which is the same asymmetry the existing check
already documents for spelled-out numbers.

**Nine screens, one entry point.** All nine are pure functions over the structured
CV, seven needing nothing else and two needing the parsed JD requirements the
platform already produces. They return findings in the same shape as the writing
checks so the rail renders them without a second code path. Screens requiring a JD
do not run on the master CV.

**One page-fill definition.** The estimate currently exists in three places: the
signed-in workstation, the public preview, and the trim dialog's candidate picker.
They have diverged — the public copy counts projects, education and certificates
while the signed-in copy counts none of them, so the anonymous preview is more
correct than the signed-in one. All three collapse to a single function. The
duplicates are deleted in the same change, not deprecated beside it.

**The one-page verdict stops being a guess.** The estimate is retained only as a
live-typing hint. The verdict that gates the download is taken from a real
measurement of the rendered export at the export's own page width. Until that
measurement exists, the download gate is downgraded to a warning — blocking a
download on a number measured wrong in both directions is worse than not blocking
at all. The build also established that line-height, not font size, is the binding
constraint on fitting one page; whatever surfaces the fit must not imply otherwise.

**Sections become user-shaped.** The closed six-key section list gains an
achievements section and a per-section user-supplied heading. The order
normaliser already discards unknown keys, so existing rows remain valid without
migration. Entry types gain an optional role field and an optional one-line
organisation descriptor, so unfamiliar employers can be explained.

**Add and remove reach both surfaces.** The add-role and add-section affordances
that exist only below the desktop breakpoint are brought to the desktop editor, and
section reordering is brought to the mobile editor. The mobile editor's writes are
routed to the document being edited rather than always to the master.

**Reservoir re-scoring is a forward pass.** Banked CV points are re-checked against
the new standard when the user next opens the surface that shows them — never on a
schedule, never for users who do not return, and the pass must be visible on the
surface that fires it. Nothing is rewritten on the user's behalf; the re-check
produces findings, and the user acts on them.

**Retirements, in the same commits as their replacements.** The two duplicate
page-fill implementations; the trim dialog's partial reimplementation; the
export-only helper in the content checks that is exported but has no callers outside
its own file. Each is deleted when its replacement lands, per the repository's
delete-on-the-way-past rule — not left in place with a comment.

## Testing Decisions

A good test here asserts what the user would observe: given this CV, these findings
appear, with these messages, and this score results. It does not assert how the
classifier reached its conclusion, which rule fired first, or the internal shape of
a findings array. Tests that lock in implementation detail are what currently make
the page-fill estimate hard to correct — the existing suite passes against the
wrong behaviour.

**The outcome classifier is tested hardest.** A fixture table of real bullets, each
labelled outcome or scope, drawn from the CV that prompted this work and from the
banked reservoir points. It must include the cases that broke the old check: a bare
year, a count of framework levels, a team size, and an inventory total — all of
which must classify as scope. It must also include the inverse: a percentage
reduction, a revenue delta, a before-and-after pair, and an adoption figure, which
must classify as outcome. False positives are the failure mode that matters, so the
suite is weighted toward lines that should NOT be flagged.

**All nine screens are tested,** each with a fixture that trips it and a fixture
that does not. These are pure functions with obvious inputs; the cost is low and
these are the checks most likely to be quietly broken by a later change.

**The page-fill consolidation gets a regression test** proving the signed-in and
public surfaces produce an identical verdict for an identical CV, and that a CV
gaining a projects or achievements section changes the verdict. The existing
page-fill suite is rewritten rather than extended, because it currently asserts the
behaviour being removed.

**The score path is tested end to end** — findings in, two numbers out — including
that Match is unchanged for a CV with no writing findings, so the split is provably
additive rather than a silent redefinition of the existing number.

Prior art for all of the above already exists in the frontend test directory:
suites covering the content checks, the page-fill estimate, the match score and the
fix loop. Follow their shape.

## Out of Scope

- **Rewriting bullets for the user.** This PRD detects and explains; it does not
  generate. Bullet rewriting exists separately and is not changed here.
- **Any model call in the new checks.** Both the classifier and the nine screens are
  deterministic. If a check cannot be made deterministic it does not belong here.
- **The rewrite path's integrity defects** (backlog #47) — fabricated roles, model
  reasoning persisted as CV content, silently deleted sections. Severity 1 and
  scheduled ahead of this work, but a separate contract on the write path.
- **Version diff and restore** (backlog #53). User stories 24–27 describe it because
  it is the same user problem; the implementation is its own piece of work.
- **Changing what Match means.** Requirement coverage stays exactly as it is.
- **Backfilling the reservoir.** Re-scoring happens on return, never on a sweep.
- **A redesign of the CV workstation.** The header gains a number; nothing else moves.

## Further Notes

The reservoir is the reason to do the writing checks before the structural work.
2,254 points are already banked across 201 of 410 uploaders, and roughly seven in
ten of them are activity statements rather than outcomes. The classifier upgrades
data that already exists, for users who already exist, with no new collection and no
new prompts — and it surfaces on return, which makes it a forward pass rather than a
migration.

The nine screens are individually unglamorous and collectively the difference
between a CV that is clean and one that is correct. Every one of them caught a real
error on a CV built carefully, by hand, with the JD open — including two that would
have been submitted to Amazon.

One asymmetry worth holding on to, because the existing check already learned it the
hard way and wrote it down: a false negative costs a suggestion, a false positive
costs the reader's belief in every other row in the rail. The classifier should be
generous. It is better to miss a weak bullet than to tell a user their best line is
not an achievement.

Finally — the gold standard is not "more checks". It is a definable target, and it
should be stated on the page in the user's language: every bullet leads with a
quantified outcome; one page, verified; sections that fit the person; no internal
contradictions; every JD requirement answered or knowingly conceded.
