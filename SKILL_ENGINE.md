# The Skill Engine — locked design

**Status:** design locked 2026-08-06 with Shivam via `/grill-me` + `/brooks-design`.
No code written yet. Build order at the bottom.

Myro's USP is the skill it extracts from a job and the gap it shows against a CV.
This document is the design of that one thing.

---

## The invariant

> **No code path may create a job without skills.**

Skills are an **output of ingest**, not an enrichment of it.

Everything below follows from that one sentence. Today skills are an optional,
slow, failable second pass, which is why 10% of the corpus has none. You cannot
sell "we know what this job needs" on a pipeline where knowing is optional.

---

## What was actually broken (measured 2026-08-06, prod)

6,252 scraper jobs carry zero `job_skills` rows. Their descriptions average
3,572 chars — statistically identical to the 55,956 that worked (3,604). The
text was always there.

`jobs.enrichment_status` had already recorded what happened. Nobody read it:

| status | jobs | recommendable | verdict |
|---|---|---|---|
| `not_applicable` — "job inactive before enrichment" | 2,218 | — | latency killed them |
| `not_applicable` — no reason recorded | 1,248 | — | older path |
| `(null)` — never enqueued | 1,654 | 335 | silent loss, 20260417→20260727 |
| **`complete`** | **1,088** | **148** | **declares success, wrote nothing** |
| pending / processing / failed / retryable | 44 | 18 | queue working correctly |

Two root causes, not one:

1. **`complete` is a claim, not a fact.** The worker stamps success without
   asserting it wrote a row. Same shape as the verifier incident that served a
   45-day-dead listing as active — see
   `feedback_a_failed_check_must_not_refresh_its_own_verdict`.
2. **Extraction latency is the data-loss mechanism.** LM Studio takes 1–2 min
   per job. A few thousand queued jobs is days of backlog, and the verifier
   marks the listing inactive before enrichment reaches it. Enrichment slower
   than listing decay produces permanent corpus holes by construction.

Separately, three things were found wrong in the taxonomy layer:

- **`is_primary` is not a signal.** `true` on 340,352 of 361,313 rows (94.2%),
  and [job_matcher.py:52](backend/app/services/job_matcher.py:52) ranks on it.
  There is no importance weighting in matching today.
- **`required_level` is well graded** (1: 12.7% · 2: 41.5% · 3: 33.8% · 4: 12%)
  and the matcher never reads it. Gap-planner, upskilling and job-detail do.
- **The soft-skill exclusion list in `role_family_for_job` was typed from
  intuition.** Three of its five names match no L2 cluster at all
  (`Teamwork and Collaboration`, `Time Management`, `Leadership`); three real
  soft clusters are missing. Result: **1,056 prod jobs have a soft skill as
  their career family** (Personal Attributes 466, Business Communications 285,
  Initiative and Leadership 276, Social Skills 27, Physical Abilities 2).

---

## Brooks frame

- **The one scarce resource: judgment-model seconds per job.** Named, tracked.
  Every proposal states its cost in this unit or it is hand-waving.
- **Nearest working exemplar: we already have it.** `suggest_skills()` +
  `_required_zone()` in [job_importer.py:103](backend/app/services/job_importer.py:103)
  is a deterministic taxonomy matcher that already infers importance from
  document position — skills under *Requirements / Must have / Mandatory* score
  higher. Live in the extension preview today. Zero model calls. We adjust this;
  we do not start from a blank slate.
- **What this is NOT for:** inventing skills outside the taxonomy; teaching soft
  skills; ranking a user against other users; replacing the verifier's
  ownership of liveness.

---

## The six locks

### Lock 1 — Two-stage extraction, split at the taxonomy boundary

**Stage A — candidate generation. Deterministic, ~0 ms, runs at ingest, in this repo.**
Match JD text against the 35,108-key taxonomy and read position. Produces the
skill set *and* the must-have/preferred/mentioned zone. No model. **This alone
would have given all 6,252 jobs skills, including the 2,218 that died waiting.**

**Stage B — judgment. LM Studio, reframed from generation to classification.**
Today it is handed 3,600 chars and asked to *emit* skills — free-form output,
hence 1–2 minutes. Instead hand it Stage A's ~30 candidates and ask it to *mark*
each: required / preferred / absent, level 1–4. Output collapses from prose to
~30 structured tokens. Same hardware, order-of-magnitude faster, and it **cannot
hallucinate a skill outside the taxonomy** — which is also the fix for
gemma-class garbage (`feedback_no_cheap_models_judgment`).

Why this shape, not merely a faster one:

- **Stage B becomes optional.** A job always has skills; judgment upgrades them
  in place — the identical pattern already shipped in `compute_job_matches`
  (provisional shortlist persisted immediately, brain sharpens it later). One
  pattern, two places.
- **It decouples two wrongly-coupled facts.** "What skills does this job need"
  and "is this listing alive" are independent. Today a slow answer to the first
  destroys the second, at a measured cost of 2,218 jobs.

**The complete shift.** `firecrawl_Supabase` keeps only: fetch pages → write
`jobs` rows. Stage A runs here. The Stage B worker's *code* moves here too
(`backend/app/workers/`), and runs on whichever machine holds the GPU. LM Studio
leaves the scraper repo entirely. The scraper stops owning "does this job have
skills at all."

### Lock 2 — Provisional skills match, and say so

A job enters the candidate pool the moment Stage A runs. The card shows the fit
as provisional and sharpens when judgment lands. Same seam as the shipped
provisional shortlist. Accepted consequence: a slightly-wrong fit percentage is
visible briefly. Rejected alternative: holding jobs until judgment, which is the
exact invariant that caused this bug.

### Lock 3 — Hard vs soft is a separate axis, derived and never retyped

**Corrected on build (S3).** This lock originally said soft = L1 `Physical and
Inherent Abilities` **plus** `Communication` and `Business Communications`.
Sampling the data before codifying it found "Post Office Protocol (POP3)",
"Sendmail", "Rocket Chat" and "Amplitude Modulation Signaling Systems" inside
those two clusters. Calling them soft would delete real technical requirements
from every skill gap and from company demand — worse than leaving "Body
Language" classified hard, because it removes signal rather than adding noise.

So the one list splits into two, because they answer different questions:

| question | answer |
|---|---|
| Is this **skill** soft? | `l1_domain = 'Physical and Inherent Abilities'` — 270 skills, all five clusters sampled and uniformly soft |
| Is this **cluster** a career family? | the above, **plus** the two Communication clusters — "Communication" is not a job family the way "Software Development" is |

**Derived from the taxonomy, never a hand-typed list.** `skills.skill_kind` is a
STORED generated column; `non_family_clusters()` derives from it. The two
literal names still needed are asserted at migration time, because the original
bug was not that a list existed — it was that nobody checked its names
resolved, and three of five named nothing.

Hard skills rank the job and drive the gap. Soft skills are captured and shown
but never compete for a slot in "skills you're missing" and never become a
`role_family`. We cannot teach Ingenuity; ranking it wastes the one thing we sell.

### Lock 4 — Importance is position × level, and `is_primary` retires

Two orthogonal facts, both required:

- **Which skills gate the job** → JD position (must-have zone), plus how often
  the company repeats it across their own JDs.
- **How deep** → `required_level` 1–4.

"Python at L4 required, you are at L2" is already expressible end to end:
`job_skills.required_level` and `user_skills.matched_level` are the same 1–4
scale. The matcher simply reads neither. It reads `is_primary`, which is a
constant. `is_primary` is deleted in the same commit that replaces it.

### Lock 5 — Skill levels validate seniority; they do not vote

`seniority_for_job()` takes `max()` of title-regex, min-years and stored level —
already inflation-prone. The skill-level profile becomes a **disagreement
detector**: title says intern but every skill is L4 → flag for review, never
silently promote. Seniority gates what a user is allowed to see, so it must not
gain a fourth way to be wrong.

### Lock 6 — Company demand is computed over all observed JDs

277 companies, median 50 JDs each. Only 121 clear 10 *live* JDs — but 230 clear
10 observed. There are 18,203 dead listings, 15,059 already carrying skills and
17,947 still holding full text.

A closed job is worthless to apply to and excellent evidence of what a company
hires for. Demand is computed over **every JD ever observed**; live count is
shown separately and never conflated. This also makes the 2,218 queue-death jobs
worth re-extracting.

**The gating bar:** a skill is *gating* when it appears in the must-have zone in
**≥60% of that company's JDs for that role family, with ≥10 JDs behind the
claim**. Below 10 JDs we show the skills and never the percentage. No number we
cannot defend.

The sentence this produces is the Delta-4:

> "Appears as a must-have in 78% of Deloitte's strategy roles, at L3. You are at L1."

No job board can write that. The delta is not the taxonomy — everyone has a
taxonomy. The delta is the ranked, levelled, company-scoped gap.

### Lock 7 — The user side splits the same way

Myro Score and the CV gap both split hard/soft. Only hard skills generate
"learn this next". Soft skills are shown as evidence found in the CV, never as a
deficit. One consistent mental model across job and user — a user must be able
to predict what "a skill" means without knowing which side of the product they
are on.

---

## Build order

Each slice is shippable and independently verifiable.

**S1 — the seam and the invariant. DONE** (`73636fe9`, `599b69e0`).
Lift `suggest_skills`/`_required_zone` into one `skill_extraction` module; make
it the only writer of `job_skills`. Backfill the 6,252 and the 18,203
dead-with-text. Dead-man metric — *count of jobs with zero skills*, emitted from
an always-up process, because a metric emitted by the enrichment worker cannot
detect the enrichment worker not running
(`feedback_absence_of_signal_alerting`). Assert on write: `complete` may not be
stamped without a row.

**S2 — reframe Stage B. DONE, throughput VERIFIED 2026-08-07.**
25 jobs, `--provider local`, LM Studio `google/gemma-3-4b`:
`seen=25 upgraded=25 unreachable=0 mean_seconds=12.5` (range 5.3–16.6).
**1–2 min → 12.5 s/job.** `ruled` equals `offered` on nearly every job (11–12 of
12) and `required` ranges 1–8, so it discriminates rather than stamping.

Neither candidate cause was the model. The old cost was the OUTPUT SHAPE: same
4B model, closed list, derived budget (118–168 tokens) → 12.5s. The lock's
premise was half wrong in the other direction too — the scraper's prompt already
constrained skills to a retrieved vocabulary; the free-generation part was the
35-word `job_summary` sharing the call.

⚠️ **The `auto` provider is unusable on this path.** The first live run returned
`ruled=0` on all 20 jobs. The ladder picked
`nvidia/nemotron-3-super-120b-a12b:free`, which writes its reasoning into
`content`; the derived budget truncates it mid-thought, so not one `|` line is
ever emitted, `parse_judgment` correctly drops everything, and 20 jobs spend an
attempt for nothing. A budget sized for the answer assumes a model that emits
only the answer. Use `--provider local`.

> **Ownership contract, settled in S1 after getting it wrong twice.**
>
> - **The work SET has one definition:** `jobs.has_skill_floor`, a boolean
>   maintained by the same trigger on `job_skills` that already maintains
>   `role_family`. Nothing may re-derive it from an anti-join. The first attempt
>   did, and it fought the transport four ways: PostgREST silently caps every
>   response at 1,000 rows (`db-max-rows`; `.range(0, 4999)` still returns
>   1,000, and a truncated work list is indistinguishable from a finished one),
>   the 8s `postgrest_client_timeout` is a web deadline applied to batch work,
>   Supabase's server-side `statement_timeout` cancels it regardless of the
>   client (57014), and each batch's writes dirty the visibility map the next
>   batch depends on. Reading a trigger-maintained boolean is 2ms.
> - **The work LIFECYCLE has one owner:** `jobs.enrichment_status`, the
>   enrichment pipeline's. Stage A must not write it. The first attempt claimed
>   through it and released barren jobs to `not_applicable`, which removed 586
>   jobs from Stage B's queue on the strength of a weaker method's failure —
>   "Stage A found nothing" is not "nothing is findable".
> - **Each stage owns one attempt column.** Stage A has
>   `jobs.skill_floor_attempted_at`; that is the whole of its authority. Same
>   split the listing verifier keeps between `last_verification_attempt_at` and
>   `listing_confidence`.
>
> Two readers of one work set is fine. Two definitions of the work set, or two
> writers of one lifecycle column, is the break.

**S3 — hard/soft, derived. DONE** (`a9fa56da`). `skills.skill_kind` is a STORED
generated column (270 soft / 34,844 hard); `non_family_clusters()` derives the
career-family exclusion and asserts its two literal names resolve. 1,233 jobs
repaired to 0 mis-filed — 985 to a real family, 248 legitimately NULL. The count
was 1,056 when this doc was written and 1,233 by the time it was fixed, because
S1's backfill wrote 5,287 new families through the same broken function.

**S4 — importance. DONE** (`7fc2417e`). Score is
`sum(required_level * min(user_level/required_level, 1)) / sum(required_level)`.
One formula in `job_matcher.score_wanted`, called by the batch matcher,
`on_demand`, feed_warm and the pre-login preview — they previously held three
copies. Soft skills excluded from both sides.
⚠️ **`is_primary` is NOT deleted.** Six consumers outside matching still read it
(gap_plan, skills_refresh, analyse, detail, upskilling, a demand rollup), each
with its own ordering semantics. That removal is its own slice.

**S4.5 — the forward flow. DONE 2026-08-07.** Not planned; found while scoping
S5, and S5 cannot be honest without it.

Lock 6's bar reads the must-have zone out of `job_skills.is_primary`. Measured:
55,958 of 61,280 skilled jobs (**91.3%**) carry only `evidence_source =
'enrichment'` rows, and `is_primary` is true on **94.2%** of them. It is a
constant. Read through the bar, Accenture × Banking Services returns every skill
at 100% must-have — "Ingenuity" and "Global Perspective" included.
`role_family_market_skills` and `role_family_aspiration_skills` already count
that constant as demand today.

The constant is written by `apply_job_enrichment`, and would be written again on
every future scrape:

```sql
DELETE FROM public.job_skills WHERE job_id = p_job_id;
INSERT INTO public.job_skills (job_id, skill_id, is_primary, required_level)
SELECT p_job_id, skill_id, TRUE, required_level FROM _incoming_job_skills
```

The hard-coded `TRUE` is the constant. The `DELETE` is worse: enrichment runs
*after* Stage A on a new job, so it destroys the floor's position read and every
Stage B verdict, then writes the constant over the top — and `has_skill_floor`
stays true, so Stage A never gets the job back. 20260806b's `IF v_incoming > 0`
guard only ever covered the empty case.

Shipped (`20260807b_enrichment_stops_owning_skills.sql`):

- **Enrichment keeps only what it alone produces** — `job_summary`,
  `role_domain`. `job_skills` belongs to Stage A (position) and Stage B (depth).
  `p_skills` is still accepted and ignored so the deployed worker's signature
  does not change mid-run.
- **The terminal condition moved with the ownership.** Asserting a skill row was
  right while enrichment wrote skills; kept after the split it inverts into the
  contract's own fault — stamping `not_applicable` because *Stage A* had not run
  yet. `complete` now asserts what enrichment produced. The floor gap keeps its
  own owner, the dead-man heartbeat.
- **`main_skills` derives from `job_skills`** in the trigger that already
  maintains `role_family`/`has_skill_floor`, zone first, capped at 12. It was
  enrichment's own list while the matcher read somewhere else — two answers to
  one question.
- **`csv_importer._resolve_and_upsert_skills` writes nothing** (drift counting
  stays). That was the other writer of the constant.
- **Stage B's rows are named** (`20260807_stage_b_judgment_evidence.sql`):
  `evidence_source = 'judgment'`, and both lease guards ask for it. They asked
  for `'enrichment'` — the scraper's own value on 361,165 rows, with no
  timestamp to separate them. Right by accident at 5 overlapping jobs; wrong the
  moment ingest writes a scraper row onto a floored job.

**Deliberately NOT done: no backfill.** The 58,181 jobs Stage A has never seen
keep their constant. Forward-only, by decision.

**S5 — company demand rollup.** Gating skills per (company, role_family) over
all observed JDs. Surfaces on /companies.

Scope, measured: **1,061 (company, role_family) pairs clear ≥10 observed JDs** —
146 companies, 42,918 JDs; 808 pairs clear 10 *live*. Lock 6's own numbers (230
companies at ≥10 observed) counted companies, not company×family pairs.

⚠️ **Read the denominator before trusting a percentage.** Until a job's skills
carry a zone, its `is_primary` is a constant and its contribution to the bar is
noise that always votes yes. S5 must compute the share over rows that actually
carry a document read — `stage_a` and `judgment` — and report the JD count
behind every number. Sampled on 200 legacy JDs, Stage A grades 43.3% must_have /
42.1% preferred / 14.5% mentioned, so the zone is real signal where it has run;
it is bimodal per job (many postings carry no requirements heading at all),
which is exactly why the ≥10-JD floor exists.

**S6 — seniority validator.** Disagreement flag, no new vote.

**S7 — user side.** Score + gap hard/soft split.

**Stage-one note.** This is stage-two work by the cockpit's ordering. The honest
stage-one link: `get_market_skills()` and the domain scoring read `job_skills`,
so a corpus with 10% holes distorts the Myro Score a first-time user sees. S1
alone repairs that.
