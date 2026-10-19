# JD Reflection — the paper answers the job, and a gap stays a gap

**Architecture spec. Written 2026-10-15 from the PwC DTDS Manager paper
(`ext_8ff18abd4dbc0d60532d`, requisition 738091WD) and the five deepening
candidates closed the same day.** Implementation by Cursor. UI slices go
through `/frontend-design`.

> **VERIFY IN CODE before building.** Each slice is its own commit on
> `Develop`, six gates green. Nothing here reopens ADR-0016, ADR-0023,
> ADR-0024, ADR-0025, or ADR-0026.

---

## 0 · Amendment 2026-10-19 — a judge rules the panel (Shivam)

**What changed.** §3 rule 2 ("a motion is a phrase") is retired. Measured on
every cached panel on prod (52 panels, 676 requirements): the phrase rule took
the last three content words of a clause, so it missed real evidence
("dashboards with real-time visibility" needed the words `real time
visibility`), and 63 of the 68 lines it would prove rested on one word ("plan"
proved "Plan and budget projects"). Requiring two words left 5 of 676. A string
rule cannot judge whether a line proves a requirement.

**The rule now.**

1. **Named tools stay a string fact.** A requirement that offers tools as
   alternatives — "such as", "at least one of", "one of the following", or a
   list joined by "or" ("SQL, Python, or R") — is proven by any line that names
   one of them as a whole token. No model. (§3 rule 1, unchanged.)
2. **Everything else is one judgment-lane call per (person, job) panel.**
   Each requirement's three best lines by cosine — told and untold stories, CV
   bullets, the skills line, the summary — go to the judge in one batch. It
   names the lines that, on their own, show the person did what the
   requirement asks. Cosine orders the candidates; it is never the verdict.
3. **The panel is the one answer.** The verdict, the proving line, and every
   CV line the judge ruled proving (`proof_lines`) are cached in the coverage
   row (`job_deepenings`, `jd_coverage`). The weave interview, the weave's
   sole-proof and `why` guard, reservoir projection, and Match Eval's
   reflection block read the panel. None of them judges again.
4. **Status.** A told story or a CV line that proves → `covered`; an untold
   story that proves → `weak` (Shivam, 2026-09-13: a CV line is a start, not
   an answer); nothing proves → `gap`.
5. **An answer is judged once.** A banked gap answer flips its row only when
   the judge says the answer proves it. Otherwise the room is marked stale and
   re-judged once the answer is a story.
6. **A failed judge writes nothing.** A fresh panel whose judge call fails is
   not cached and shows no rows (same as a failed parse); a stale panel keeps
   its last verdicts.
7. **Forward pass.** A panel without the judge's stamp is stale: it re-judges
   with its own requirements (no re-parse) the next time its person opens it.
   No backfill.

The rest of this spec reads with "`reflect`" meaning the panel's verdicts.

## 1 · The rule

One module answers "does this line of the person's own evidence entail this
motion in the job description?" Coverage, the weave interview, the lines
handed to the writer, the weave `why`, reservoir projection, and Match Eval
read that answer. Cosine may order candidate lines. It cannot mark a motion
proven.

The Job Document is that answer on the page: the current seat first, then the
motions the description is hiring for, skills led by the tools that proved a
motion (ADR-0026). A Take may not drop the only line that proves a motion.
Apply stays Match Eval's word (ADR-0024). The evaluation sees the reflection
as facts.

## 2 · What the PwC paper got wrong

Measured on Shivam's job document v11 and the weave cache from 2026-10-15:

- "Oversee creation of data pipelines and warehouses" was covered by a sales
  bullet about inbound requirements and a qualified pipeline.
- "Alteryx, Power BI, Tableau" was covered by JLL property dashboards that
  name none of those tools. Tableau sits on the skills line and was not the
  proving line. Similarity on the covered rows was 0, because an interview
  answer flips status to covered and keeps the old similarity.
- The weave `why` then said sales-enablement bots prove data warehouses, and
  an EV maturity framework proves exploratory data analysis. The bullets
  stayed closer to the source. The honesty guard checks numbers on kept
  lines. It does not check that a drop removed the only cloud bullet
  (Azure, GCP, AWS) or that the summary is still the IIM fest.
- Match Eval stored 3.8 and Apply with overlap 0. `missing_skills` included
  Python and SQL, which are on the skills line, because overlap joins
  Lightcast keys on `user_skills` and never reads the paper.
- The same HTML document contains a live JobPosting, Apply Now, and one
  dormant Phenom widget (`data-ph-at-id="job-completion-info"`) whose copy
  is "the job you are trying to apply for has been filled." The verifier
  matches that clause before it looks for Apply Now, so the listing was
  retired eleven seconds after import. The page a person sees is open.

## 3 · The module

`app/services/jd_reflection.py`. Pure. No database, no provider, no cosine.
Since §0 it holds only the named-tools rule, the judge's prompt and parser,
and the Match Eval block built from panel verdicts; the call itself runs in
`jd_coverage`.

```text
reflect(requirements, evidence) -> list[Motion]
```

A **requirement** is one string already parsed from the JD prose
(`jd_coverage.parse_requirements`). This module does not re-parse the JD.

An **evidence line** is one of: a CV bullet, the skills line, the summary,
a reservoir pointer. Each carries its own text and a stable id. Interview
answers are evidence only as the words the person submitted, not as a
paraphrase the extractor invented.

A **Motion** is `{requirement, status, evidence_id | null}`.
`status` is `proven | gap`. There is no weak band. A line that is merely
nearby is a gap.

### Entailment

1. **Alternatives.** A requirement that offers tools or fields as alternatives
   — "such as", "at least one of", "or" between named tools — is proven when
   any one of those names appears as a whole token in some evidence line.
   "Alteryx, Power BI, and Tableau" is proven by Tableau on the skills line.
   It is not proven by a dashboard bullet that names none of the three.
2. **Retired 2026-10-19 (§0) — the judge decides.** It said a motion is a phrase.
   The intent stands — "pipeline" beside inbound, qualified, sales, or
   requirements does not prove a data pipeline; shared nouns do not transfer
   across domains — and the judge prompt says so.
3. **The proving line is the one that carries the motion.** The Motion records
   that line's id. A later `why`, coverage row, or interview option that
   cites a different line is discarded.
4. **An answer cannot promote a gap.** `patch_requirement_answered` may set
   `proven` only when `reflect` says the answer text entails the requirement.
   Otherwise the requirement stays a gap. Similarity is not a status.

Tests lock the PwC pairs in §2, plus a line that really does say "Azure data
pipeline" proving the pipeline motion, plus Tableau on the skills line proving
the tool-list motion. A cosine score is not an input to these tests.

## 4 · Slices

Each slice is one commit. Later slices call `reflect`. They do not grow a
second entailment rule.

### S1 · The module

`jd_reflection.py` and `backend/tests/test_jd_reflection.py`. No caller
changes. The deletion test: if this file is removed, the false covers in §2
have to be re-implemented in coverage, the interview, projection, and the
`why`.

### S2 · Readers stop deciding

- `jd_coverage._classify` no longer promotes on `COVERED_MIN`. It asks
  `reflect` and stores that status. Cosine remains the order in which lines
  are tried, so the embedding work stays put.
- `cv_weave_interview` options are lines `reflect` would call proven for that
  requirement, or the closest lines under the existing floor when none are
  proven — labeled as unproven, so a tap cannot bank them as proof.
- `story_extractor` does not paraphrase an interview answer into a new motion.
  "Generated 50+ inbound requirements" stays those words. It does not become
  "Engineered a robust inbound pipeline." A chopped fragment ("Ran
  data-backed proposals") does not land.
- The weave prompt receives each requirement already marked proven or gap,
  with the proving line's text. The `why` may only name motions the cited
  lines prove. A `why` that names a gap motion is dropped; the bullets can
  still land.

### S3 · The Job Document is the page

ADR-0025: the weave run reads the Job Document when one exists, and the
fingerprint is of that experience section. The master seeds a document only
when the job has none.

On land (`land_role`, `land_extras`, `compose_weave`):

- A bullet that is the only evidence `reflect` marks proven for a motion
  cannot be dropped. The four-bullet cap yields for that line.
- Summary and skills rewrite only from facts already on the paper or in the
  reservoir. The summary leads with the current seat, then motions that are
  proven. A summary that is only the master (the fest, the school team) does
  not stay at the top when the experience section contains a proven motion.
  The skills line leads with the tools that proved a motion, then the rest of
  the person's own tools. No tool is added that the evidence does not contain.

`career_projection.project_for_job` uses the same `reflect` result to choose
stories. It does not keep a second cosine floor (`REL_FLOOR`) as a verdict.
The reservoir door stays. It is an adapter, not a second tailor.

### S4 · Match Eval sees the same facts

ADR-0024 stands. Overlap is not the grade. Apply is not blocked because a
motion is a gap.

- The judge prompt gains a reflection block: motions proven, with the line,
  and motions that are gaps. It is not handed a fit number derived from that
  block.
- Overlap for a job reads the Job Document's skills line through the existing
  Lightcast aliases (`cv_explicit_skills`), unioned with `user_skills`.
  "Python" on the paper and "Python (Programming Language)" missing cannot
  both be true for that job. Profile skills are not rewritten from the paper.
- A prompt change versions into the staleness key. Rows re-rate on the next
  Search. No backfill.

### S5 · A dormant closed-widget is not the posting

`classify_listing_response` in `job_listing_verifier.py`.

A closed marker closes the listing when it is the posting's state. Godrej's
page, whose visible copy is "the job you are trying to apply for has been
filled" and which is not also a live JobPosting with an apply control, stays
closed.

A marker that occurs only inside a dormant closed-state widget does not close
a document that also contains this requisition's JobPosting and an apply
control. Phenom's `data-ph-at-id="job-completion-info"` is that widget. The
PwC document in §2 is `seen_live`. Strip the widget's text before the marker
scan, and leave the rest of the classifier in its current order.

After S5 is green, re-run verification on `ext_8ff18abd4dbc0d60532d`. Do not
hand-edit the row ahead of the check. The sweep will retire it again until
the classifier changes.

## 5 · Out of scope

- Changing the 3.5 verdict word or the 4.0 Apply bar.
- Inventing Alteryx, Power BI, a deals engagement, or a certification the
  person does not have.
- Deleting Tailor with Mentor, the interview, or the 50-coin charge.
- Rendering career sites in a browser to decide liveness.
