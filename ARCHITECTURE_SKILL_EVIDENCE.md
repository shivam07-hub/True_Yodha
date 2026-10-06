# Skill evidence — a tag must be able to say why it exists

**Architecture spec #60. Implementation by Cursor. Written 2026-10-07 from a
`/grill-me` with Shivam, assessed with `/improve-codebase-architecture` and
`/brooks-design`.**

> **VERIFY IN CODE before building.** Line numbers are from `5a4c9e9f`. Each
> slice is its own commit on `Develop`, six gates green. Migrations are applied
> by the agent before the code that reads them, then `NOTIFY pgrst`.

---

## 1 · The defect, measured (prod, 2026-10-03 → 07)

- **"Transformation (Genetics)" sits on 2,637 jobs** — 2,217 live, 881 from
  ingests after 2026-09-30, across 101 role families — against 624 live for
  "Business Transformation". It is still growing.
- **It is ours.** 2,636 of the rows are `evidence_source = 'stage_a'`, written by
  `services/skill_floor.py` through `skill_extraction.extract_skills`.
- **It is a class, not a word.** 3,254 active skills carry a parenthetical
  qualifier; every one has a bare form that can fire the same way. This week's
  rows tag `Tracking (Commercial Airline Flight)` on "Defect **Tracking**",
  "Performance **Tracking**" and "• **Tracking** correct delivery of orders".
- **Stage A is the platform's skill truth:** 644,615 of 746,646 `job_skills` rows
  (85%). Stage B (judgment) has written 509. Nothing downstream re-checks it.
- **It has already been laundered.** `skill_closeness` (ADR-0022) now lists
  Digital Transformation (248 jobs), Scrum, Stakeholder Engagement and PRINCE2 as
  the genetics skill's closest neighbours. Thirteen SQL functions read
  `job_skills` — matching (`candidates_for_user`, `candidate_jobs_for_user`),
  closeness, demand and sector snapshots, `roles_met_by_skill_level`, even
  `role_family_for_job`.

## 2 · Root cause — four whys

1. **Why a genetics tag on a sales job?** `_bare_form_present`
   (`skill_extraction.py:153`) strips the qualifier and trusts capitalisation to
   separate the senses. Postings capitalise headings, bullets and titles.
2. **Why is guessing possible at all?** Stage A matches words against the whole
   taxonomy with no idea what kind of job it is reading.
3. **Why did it grow unseen for months?** Nothing measures tag quality; a human
   happened to read one person's prep plan.
4. **Why did it spread?** A one-word guess is stored exactly like a full-name
   match, so every reader trusts both equally — and the closeness graph learned it.

And one second-order fact that shapes the fix: **`write_skill_floors` never
deletes** (`skill_floor.py:76-125`, deliberately, after enrichment wiped good
skills in August). A better rule re-run over the corpus would add nothing wrong —
and remove nothing wrong either.

## 3 · The gate (Brooks)

| | |
|---|---|
| **Scarce resource** | A person's trust in a skill Myro shows them — measured as wrong tags reaching what people see. Slices are ranked in that unit. |
| **Owner of what a tag means** | The Skill Floor — `skill_floor.py`, already the one writer of `job_skills`. Readers never re-judge a tag. |
| **Nearest exemplar** | The CV side, 2026-09-25 (7h): `cv_skill_evidence` → `rows_for_user_skills_write` made the evidence rule the precondition of the write. This is that move for jobs. Kept as is: longest-name suppression, the case rule, the lease drain (`c183d3f4`), `match_quality.py`. |
| **Not for** | An LLM tagger (that is Stage B) · new taxonomy · role-family buckets (ADR-0022) · showing receipts to users (later, Shivam's call) |

## 4 · The decisions (Shivam, 2026-10-04 → 07)

### A · A bare-form tag needs same-domain support

Keep a tag matched only by its bare form when the same job carries **at least one
other skill from the same `l1_domain`**. Full-name matches are untouched. Proved
on prod before it was proposed:

| Skill (bare form) | Live jobs | % with same-domain support |
|---|---|---|
| Java (Programming Language) | 2,453 | 99.8 — kept |
| Python (Programming Language) | 4,808 | 97.9 — kept |
| Tracking (Commercial Airline Flight) | 372 | 25.8 — ~¾ removed |
| Scheme (Programming Language) | 137 | 16.1 — ~⅚ removed |
| Transformation (Genetics) | 2,217 | 3.0 — 97% removed |

**Accepted trade (Shivam):** ~2% of jobs where Python is the only IT skill named
lose that tag. A missing tag costs a little relevance; a wrong one costs trust.
`l1_domain` is taxonomy metadata used as a plausibility check at extraction — no
bucket is stored on a job and no fit is computed from it, so ADR-0022 holds.

### B · One rule for "which forms of a skill name count" — CV and job alike

`_skill_terms` (`skill_extraction.py`) and `cv_skill_evidence._skill_names`
(`cv_skill_evidence.py:110`) are two definitions of the same thing. Extract
**`services/skill_name_forms.py`**: the name forms of a skill, the bare-form rule,
and rule A as `bare_form_supported(skill, other_skills)`. Stage A and the CV
evidence gate both call it. One definition, two adapters.

### C · Stage A replaces its own rows — scoped self-replacement

Approved by Shivam (destructive), with three limits:
1. It removes only rows **Stage A wrote** (`evidence_source = 'stage_a'`).
   `enrichment`, `judgment` and `user_confirmed` rows are never touched.
2. If the new extraction for a job is **empty**, nothing is removed for that job —
   a thin result never erases a richer one.
3. `jobs.skill_floor_version smallint` records which rule produced a job's floor.
   The existing lease drain re-floors jobs below the current version, in batches,
   in the background. No hand-written SQL, nothing deleted by hand.

Closeness, demand and sector snapshots heal on their next scheduled refresh.
Expect `role_family_for_job` to move for a few jobs as wrong tags leave — that is
the fix showing, not a regression.

### D · The receipt — recomputed, never stored (Shivam: not in Supabase)

Stage A is deterministic: the same text and rule version always give the same
tags. So a receipt is **computed on demand**, not persisted:

```python
@dataclass(frozen=True)
class TagReceipt:
    taxonomy_key: str
    matched_as: Literal["name", "bare"]
    matched_text: str            # the words that fired, ≤60 chars of context
    zone: Zone                   # must_have · preferred · mentioned
    supported_by: str | None     # rule A's same-domain skill, for a bare match
    floor_version: int

def explain_tags(role_name: str, job_description: str) -> list[TagReceipt]
```

`extract_skills` becomes a thin projection of `explain_tags`, so the explanation
and the tags can never disagree. The only database change in this spec is
`skill_floor_version` — scheduling, not evidence. Receipts are internal; showing
"why this skill" to people is a later decision.

### E · Measure without labelling — automatic before / after

`backend/scripts/skill_tag_audit.py`, read-only: run the current and the new rule
over every live job, write a report **to a file** (never the database) — tags
added and removed per skill, top phrases from `explain_tags`. Two invariants
decide pass or fail, also pinned as a test over fixtures:

- **Anchors keep ≥97%** of their tags: Python, Java, SQL, Excel, JavaScript, AWS.
- **Known-bad lose ≥70%**: Transformation (Genetics), Tracking (Commercial Airline
  Flight), Scheme (Programming Language), Derivatives.

Plus `match_quality.py` before and after — the jobs people see must not get worse.

### F · Catch the next one early

- **Fixtures in CI:** `tests/fixtures/skill_tag_cases.jsonl` — short JD snippets
  with expected and forbidden tags, written from this incident and the cases in
  the module's own docstrings (a business JD must not yield Transformation
  (Genetics); a genetics lab JD must; Python in a backend JD must).
- **A Notice belt** (ADR-0021): daily, flag any skill whose count of distinct
  role families jumps beyond its 7-day baseline. Computed from `job_skills` —
  no new table. This one took months and a human; the next one takes a day.

## 5 · Work, in order

| # | Slice | Done when |
|---|---|---|
| S0 | E · `skill_tag_audit.py` + the invariant test, against today's rule | Report written; baseline numbers recorded in BACKLOG |
| S1 | B + A + D · `skill_name_forms`, rule A, `explain_tags`, `extract_skills` as its projection; version 2 | Fixtures green; the audit shows both invariants passing; `match_quality.py` not worse |
| S2 | C · `skill_floor_version` migration; scoped self-replacement in the write path; the drain picks up older versions | On dev, one drain batch: genetics tags fall, anchors hold, no non-`stage_a` row touched |
| S3 | F · the skill-spread Notice belt | A synthetic spike fires it; normal days stay silent |

## 6 · How we will know it worked

`Transformation (Genetics)` on business jobs falls from 2,217 live toward ~70;
the genetics skill's closeness neighbours turn scientific after the next refresh;
anchors hold ≥97%; and the next ambiguous word is caught by the belt, not by a
person reading a prep plan.
