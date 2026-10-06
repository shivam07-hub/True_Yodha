# Listing Time — one module, four questions

**Architecture spec. Implementation by Cursor. Written 2026-09-27.**

Scope: candidates 1, 2 and 4 of the 2026-09-27 architecture review. They are one
piece of work. Candidates 3 (match-health call sites) and 8 (duplicated
dead-man probes) are separate and not covered here.

This spec does not re-open [CONTEXT.md](CONTEXT.md) §Listing Verification. It
**implements** two sentences already locked there that the code does not yet
obey, and removes a third that contradicts them.

---

## The defect, measured

Run against production 2026-09-27.

| Fact | Number |
|---|---|
| Rows where `last_seen` has ever differed from `first_seen` | **0 of 52,717** |
| Active jobs whose `last_verified_live_at` is a copy of `last_seen` | **24,551 (52%)** |
| Active jobs genuinely checked by the verifier | 18,720 (39%) |
| …of those, checked in the last 7 days | 18,014 |
| Active jobs never verified | ~4,190 (9%) |
| Last ingestion | 2026-09-17 |
| Last genuine verification | 2026-09-27 (today) |

Two independent faults, one root:

1. **`last_seen` is a dead column.** It has never updated on any row. CONTEXT
   already says so — *"while the scraper does not re-crawl, `last_seen` carries
   no liveness information at all and must not be rendered as if it does"* —
   but seven constants, two `is_stale` booleans and a company-pulse window all
   compute `now − last_seen` and believe they are measuring re-observation.
   They are measuring **discovery age**, and always have been.

2. **Migration `20260711_trusted_job_lifecycle.sql:27-32` seeded
   `last_verified_live_at` from `last_seen`.** So more than half the active
   corpus wears a verification stamp sourced from a column that has never
   ticked. `listing_trust.py` was built to stop exactly this and has one caller
   (`roles_feed.py:70`); the surface users read (`job_intelligence.py:255-257`)
   coalesces the discredited column directly.

The verifier is not broken. It is being lied to about what still needs checking.

---

## The decision

**Time on a listing is four named questions, each backed by a column that can
actually answer it. Readers ask the question. Nobody touches the columns.**

| Question | Column | Type | Status |
|---|---|---|---|
| When did Myro receive this row? | `ingested_at` | timestamptz | 99.96% clean, currently unused for this |
| When did Myro last **confirm** it is open? | `last_verified_live_at` | timestamptz | real, running today — **once de-seeded** |
| What day did the crawler discover it? | `first_seen` | int YYYYMMDD | fine for display + sort only |
| When did the crawler last see it? | ~~`last_seen`~~ | — | **dead. Retired as a time signal.** |

Locked by Shivam 2026-09-27: **retire `last_seen` in code; do not change the
scraper and do not drop the column.** A second re-observation clock alongside
the verifier would be two answers to one question, which is how this started.
The column stays in the table, unread.

### Why not "just wrap the YYYYMMDD encoding"

That was the first proposal and it is wrong. The encoding is ugly — a date
packed in an `integer`, silently comparable to an epoch, six decoders with three
different failure modes — but it is a **symptom**. The disease is that four
columns answer four different questions and every reader picks one by habit.
Wrapping the encoding would make the wrong column easier to read.

---

## The module

`backend/app/services/listing_time.py` — new. One module, no state, no I/O.

It owns the four questions above and the decoding they need. It is the **only**
place that may convert a YYYYMMDD marker, and the only place that may name a
freshness threshold.

**Interface** — everything a caller must know:

- Takes a job row (mapping) and an explicit `now`. Never reads a clock itself,
  so every verdict is reproducible in a test.
- Returns a **verdict object**, not a boolean. Three states everywhere, never
  two: `confirmed_open` / `unconfirmed` / `closed`. *Unparseable, absent and
  never-checked all collapse to `unconfirmed`* — never to "fresh". Absence is
  not a verdict ([CONTEXT.md](CONTEXT.md) passim; same rule as F3/F4 seniority).
- Total on bad input. No raising, no `None`-vs-passthrough fork. The three
  current decoders disagree on this and that disagreement is the bug.
- One clock: **UTC**. `job_importer._today_marker` uses server-local today and
  `repositories/jobs._fresh_cutoff_marker` uses UTC; for part of every day they
  disagree about what day it is.

**Behind the seam** (implementation detail, callers must not know):

- YYYYMMDD ↔ date conversion.
- The threshold numbers, which become **one** set instead of seven.
- The de-seeding predicate — how we tell a genuine verification stamp from the
  2026-07-11 copy.

### What the module must NOT own

Not "is this recommendable", not ranking, not the ATS probe. Those consume a
verdict; they do not live inside it. `listing_trust.verification_claim` keeps
its job (*may we say this was checked*) and calls this module for the *when*.

---

## Work, in order

Each step is independently shippable and green. Do not batch them.

### 1 · De-seed the false stamps — ✅ APPLIED 2026-09-27

A migration that nulls `last_verified_live_at` wherever it is a copy of
`last_seen`, i.e. the 24,551 rows where
`last_verified_live_at::date = to_date(last_seen::text,'YYYYMMDD')`.

This is the highest-value single action in the spec. The verifier's
`claim_verify_targets` orders `NULLS FIRST` over oldest-unchecked, so nulling
these puts all 24,551 at the **front** of a queue that is already clearing
~18,000 a week. The corpus becomes genuinely verified in roughly two weeks with
no new machinery.

Additive and reversible in the sense that matters — it removes an unearned
claim, and the verifier re-earns it. But it is a write over half the corpus:
**Shivam applies it, same session, with `NOTIFY pgrst, 'reload schema';` and a
spot-check after.**

**⚠️ It must NOT touch `listing_confidence`, and did not.**
`is_recommendable_listing` (`job_intelligence_policy.py:38`) returns true ONLY
for `listing_confidence = 'active'`. Flipping the de-seeded rows to
`'uncertain'` in the same statement would have halved the recommendable corpus
instantly — **36,968 → 18,705** — while ingestion is already frozen. The
verifier sets that field per row, on evidence. A migration must not guess it.
This was found after the first draft of this spec and is the main reason step 1
is one column, not two.

**Applied 2026-09-27** as
`database/migrations/20260927100000_deseed_false_verification_stamps.sql`,
with `NOTIFY pgrst, 'reload schema'`. Verified after:

| | before | after |
|---|---|---|
| stamps equal to `last_seen` | 26,521 | **0** |
| recommendable (`is_active` + confidence `active`) | 36,968 | **36,968** |
| active awaiting a real check | 4,190 | **28,741** |
| genuinely stamped | 18,705 | 18,724 |

No user-visible change, as predicted: `job_intelligence.py:255-257` still
coalesces to `last_seen`. That coalesce is step 3 and is now the thing standing
between the user and the truth.

Guard against re-seeding: `20260711_trusted_job_lifecycle.sql`'s `SET` block
must never re-run. It is a one-shot historical migration; if anything replays
migrations wholesale, that file needs a guard before it does.

### 2 · Build `listing_time.py` with its tests, wired to nothing

Pure module, full test coverage, no callers yet. The interface is the test
surface — if a case is awkward to write, the interface is wrong; fix it here,
before there are callers to churn.

Cases that must exist: unparseable marker → `unconfirmed` (not fresh);
never-verified → `unconfirmed`; seeded stamp → `unconfirmed`; genuine recent
stamp → `confirmed_open`; day-boundary either side in UTC.

### 3 · Move readers onto it, one at a time

Each its own commit, five gates green, no behaviour change except where the
behaviour was wrong:

- `job_intelligence.py:255-257` — **first**, it is what the user reads. Stop
  coalescing `last_seen`.
- `repositories/jobs.py:1791` `_is_marker_stale` → the module.
- `job_intelligence_policy.listing_confidence` → the module.
- `company_pulse.py:35` `FRESHNESS_WINDOW_DAYS` → the module. Done: it decays
  over `CONFIRM_WITHIN`, and since `20261006090000` its input is the verifier's
  last check on a live row, not the marker.
- `listing_trust.verification_claim` → takes the verdict.
- Frontend: `card-view.ts:159,202`, `mobile/redesign/job-model.ts:201,210`
  (desktop says discovery age, mobile says `verified {age} ago` off the same
  dead marker — they disagree today for the same row).

### 4 · Fix `jobs_added_1h` — or delete it

`repositories/jobs.py:644,629,676` — `_marker_to_dt` turns a day marker into
midnight UTC and compares it to `now − 1h`, so the number on the public landing
page is structurally **0 for 23 hours of every day**, and in the hour after UTC
midnight it silently equals the daily total.

It is computable correctly from `ingested_at`, which is a real instant and
99.96% populated. Either compute it from that or delete the field — a wrong
number on the landing page is worse than no number. Same call for
`scraper_started` (`:678-679,:736`), which publishes the **oldest** marker in a
filtered result set under a name claiming a process start, and which
`intel-filters.ts:19-37` then ticks as a live uptime clock every second off a
value with one-day resolution.

### 5 · Delete on the way past

- `repositories/jobs.py` marker privates (`_job_feed_marker_to_iso`,
  `_marker_to_dt`, `_is_marker_stale`, `_marker_int`, `_fresh_cutoff_marker`)
  once nothing imports them. They are underscore-private and imported across
  module boundaries today (`job_projection.py:14`, `routers/jobs/list.py:15`).
- `job_intelligence_policy.marker_to_iso_date`, `job_feed/contract._parse_batch_date`.
- `backend/app/services/forge_service.py` — 15 lines, **zero callers**, its own
  docstring says the feature it declares was removed.

### 6 · Correct the contradiction in CONTEXT.md

§Listing Verification currently says both *"`last_seen` carries no liveness
information at all"* **and** lists *"last_seen older than 30 days"* as a
gone-signal that marks a listing closed. Both cannot hold. The second must go:
with `last_seen` frozen and ingestion stopped, it would close listings the
verifier confirmed open today, purely for having been discovered a month ago.

---

## Out of scope, deliberately

- **Changing the scraper.** Locked: no cross-repo change.
- **Dropping `last_seen`.** Destructive on a 52k production table with readers
  in two repos. Retiring it in code gets the value with none of the risk.
- **Migrating `first_seen` to `date`.** Only display and sort read it after
  this spec; the encoding stops mattering once nothing does date maths on it.

## How we will know it worked

- `select count(*) from jobs where is_active and last_verified_live_at is not
  null and last_verified_live_at::date = to_date(last_seen::text,'YYYYMMDD')`
  → **0**, and stays 0.
- Genuinely-checked share of the active corpus rises from 39% toward the
  verifier's real throughput. Watch weekly.
- One grep for `last_seen` across `backend/app` and `frontend` returns only the
  module and the scraper-facing write path.
- `jobs_added_1h` is non-zero outside 00:00–01:00 UTC, or gone.
