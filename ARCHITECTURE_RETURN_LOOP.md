# A returning user finds their list — the Return Loop

> Written 2026-09-29 from the first instant-seeker batch. Assessed with
> `/brooks-design` and `/improve-codebase-architecture`. BACKLOG #55.
> **VERIFY IN CODE before building** — line numbers below are from `a624c2e1`.

The goal's last word is *repeat*. Today a person who comes back to Myro most
often comes back to **nothing**: the list they were judged for is hidden, the
re-read that would rebuild it waits until they open /market, and nothing outside
the app tells them to come back at all.

---

## 1 · Evidence

**Batch 1, four people job-hunting right now (2026-09-29):** 0 of 4 had tailored
a CV; 0 of 4 had an application recorded; **3 of 4 open /market to zero cards**
("Read 0 of 980 jobs. 0 worth your time."); every one of their bell
notifications is unread; one person's direction change (09-19) never got a run.

**Platform sizing, same day:**

| Fact | Number | Source |
|---|---|---|
| People with stored verdicts | 210 | `user_job_matches` |
| Prompt-version bumps since 2026-09-16 | 3 (v2, v3, v4) | `llm_ranker.PROMPT_VERSION` history — **each one hid every one of those 210 lists at once** |
| Memory distilled in the last 30 days | 86 people | `user_profiles.last_memory_distill_at` — each distill hides that person's list |
| Direction changed in the last 30 days | 56 people | `target_updated_at` |
| Verdicts that can never read as current | most — avg 0.6 distinct keys per person | rows written before `eval_context_hash` existed are NULL-keyed |

## 2 · The mechanism (read in code)

1. **Membership is keyed on the wrong question.** `published_list.assemble`
   (`services/matching/published_list.py:131-178`) shows a verdict only when
   `row.eval_context_hash == eval_context_key(profile)`. That key hashes
   `[PROMPT_VERSION, baseline_version_id, target_role_title, target_seniority,
   target_location, known_facts]` (`onboarding_service.py:67-112`). It was built
   to answer *"should the brain re-rate this?"* and is also answering *"may the
   person see this?"* — so a prompt edit or a newly distilled memory fact makes a
   whole list **invisible**, not merely due for re-rating.
2. **The re-read has two doors, both narrow.** `feed_warm.enqueue_feed_warm` is
   called from `POST /jobs/feed/warm` (/market only, `routers/jobs/list.py:477`)
   and from the initial match run (`cv_workflow.py:72`, `0d78726c`). A person who
   lands on home, CV or Collections never starts it. It reads 8 jobs a tick.
3. **Three surfaces, three rules for the same verdict.** /market hides anything
   not current. Agent Picks (`agent_picks.regenerate_for_user`) and Collections
   (`collections/resolve.py`) never ask — they show a verdict from an old
   direction as if current (batch 1: 11 picks from a direction the person left).
4. **No way back from outside.** `match_run.announce_fresh` is the one writer of
   "N fresh matches", and it writes only to the in-app bell (100% unread in
   batch 1). `email_service.send_email` exists and is used for login, growth,
   institutions — never for new matches.

## 3 · Brooks gate

**Scarce resource — the returning visit.** A person job-hunting now comes back
a handful of times. Each return that lands on an empty or stale list spends one
of them. Rank every slice by *returning visits that land on at least one job worth
applying to*, per judge call spent. Judge calls are the cost ceiling, not the
currency — do not rank by verdicts re-rated.

**Conceptual integrity — one owner.** The **Match Verdict** model (CONTEXT.md
§Match Verdict, §Provisional Match) owns "what a person sees about a job".
Shivam locks the product answers in §6; one implementer builds all slices
against this doc (the architecture-spec pattern: we hold the design, Cursor
implements). No surface keeps its own currency rule after S2.

**Closest exemplar — this is an extraction.** `assemble` already does the right
thing for one case: when the CV changed it shows the *previous* CV's verdicts
under "These matches are for the CV you replaced. Reading the one you saved."
(`cv_replaced`). Provisional Match already establishes "a list that sharpens in
place". `forward_pass.finish_outstanding_match` already puts a door on
`/users/me`. Generalise those three; invent nothing.

**What this is NOT for:** not a platform-wide re-rate (never backfill — a person
who does not come back costs nothing); not new ranking or scoring logic; not a
new notification surface or modal (the bell item and the Next chip exist); not
real-time re-rating on every memory edit.

## 4 · The design — one deep module, one door, one transport

### A. Verdict Currency (the deep module)

One function answers, for a person and a stored verdict:

- `current` — judged for this CV, this direction, under today's rules and facts.
- `stale` — same CV, same direction (`target_context_hash` + `baseline_version_id`
  match), but the brain's inputs moved (prompt version, memory facts) or the key
  predates the column. **Shown**, ordered after current, marked as being re-read;
  it upgrades in place when the drain re-rates it.
- `foreign` — another CV or another direction. **Not shown**; the
  `cv_replaced` fallback remains the one honest exception while a new CV is read.

Every reader asks it: /market (`published_list`), Agent Picks, Collections, the
Next chip's best-job rung. Deletion test: remove it and the three rules above
reappear, which is exactly the bug.

The interface hides the two hash columns. Callers never compare
`eval_context_hash` or `target_context_hash` themselves (Parnas — a module that
exists to give one answer does not export both of its inputs).

### B. The Return door (a forward pass)

`forward_pass.refresh_stale_list` on `on_profile_read` (`/users/me`, every authed
page — the path the whole cohort walks): claim per (user, eval key), check cheap
(does this person have `stale` rows and no drain in flight?), enqueue
`feed_warm`. **Re-rate the rows they can already see first** (their stale list),
then the unread pool. It finishes work the person started (the search behind
their list) and only runs because they came back — inside the doctrine.

### C. The outside channel (a transport, not a feature)

`announce_fresh` keeps being the one writer; it gains an email transport behind
the same seam: at most one digest per N days, top three jobs worth applying to,
each with the card's **Tailor CV** link (`2c43f0e9`), unsubscribe in one click.
Written only from verdicts that already exist — it spends no judge calls on
people who are away.

## 5 · Second-order checks (chased to code)

- *Stale + direction change* → `foreign`, hidden; `match_freshness` reads
  `outstanding` and `finish_outstanding_match` runs. Correct for batch 1's
  direction changer.
- *Stale rows and the rules that moved.* Admission (closed · location · level)
  runs at read (`admission.py`), so those never go stale. Only brain-side rules
  lag — e.g. a v3 `Apply` on a job that breaks a won't-take line shows until
  re-rated. The door re-rates visible rows first, so the window is one visit.
- *PROMPT_VERSION bumps become cheap.* Today a prompt fix is a platform outage of
  every list; after A, it is a background re-read. Nothing else should change.
- *Agent Picks regen after S2* must exclude `foreign` — it currently re-publishes
  picks from a left direction.
- *Drain cost after a bump.* Claim per eval key → at most one re-read per person
  per change, only for people who return. 58 people had a verdict written in the
  last 30 days; that is the realistic ceiling, not 210.
- *Notice copy.* "Read 0 of 980" is true and useless on return. With stale rows
  shown, the existing `progress_line` names the re-read instead.

## 6 · Decisions for Shivam before code

1. **Show stale verdicts, marked, while re-reading — or keep hiding them?**
   Recommended: show (it is what `cv_replaced` already does for a changed CV).
2. **The email digest:** yes/no, cadence (recommended: at most every 3 days,
   only when ≥1 new job worth applying to), and whether signup consent covers it
   or it needs an explicit opt-in.
3. **Re-rate budget per return visit** (recommended: the visible stale list in
   full, then the normal 8-per-tick drain).

## 7 · Slices — ranked by returning visits landed per judge call

Each is its own commit, six gates green.

| # | Slice | Judge calls | Why this rank |
|---|---|---|---|
| S0 | **Measure first.** Share of /market views whose list rendered 0 cards, 30 days (from `job_recommendation_exposures` + `core_loop_events`); record the baseline here | 0 | Sizes S1–S3; Brooks: the cheap measurement before the commitment |
| S1 | Verdict Currency module; /market shows `stale` rows marked, after `current` | 0 | Turns the 3-of-4 empty returns into full lists with no model spend |
| S2 | Agent Picks, Collections, Next chip read Verdict Currency; `foreign` leaves Picks | 0 | One rule on every surface; removes old-direction picks |
| S3 | Return door: `refresh_stale_list` pass on `/users/me`, visible rows first | ~list size per return | Makes stale rows current within the visit |
| S4 | Email transport behind `announce_fresh` (after decision 2) | 0 | The only slice that reaches people who are away |
| S5 | Apply clicks from before `3ff55125` with no application row: file them `saved` on return so "Did you apply?" can ask | 0 | Two batch-1 people; tiny; finishing work they started |

**S0 baseline, 2026-10-13** (`published_list.assemble` as shipped, every real
person with a verdict and `last_active_at` in 30 days): **39 of 54 opened /market
to zero cards.** 18 of the 39 held stale verdicts worth showing; the other 21
hold nothing worth showing under any rule. `job_recommendation_exposures` could
not answer this — an empty list writes no exposure row. (The S1 commit said "of
51": its cohort read asked PostgREST for many people's rows at once and the
1,000-row cap dropped three heavy ones. Count people one read each, or in SQL.)

**S1 shipped 2026-10-13** — `matching/verdict_currency.py`; /market lists stale
cards after current ones with `rereading: true`, a motion state on the ring.
Same people re-run on the new code: **21 of 54 empty**, no current card ordered
after a stale one. A `PROMPT_VERSION` bump now leaves the card count unchanged
(`test_published_list.py`).

**S2 shipped 2026-10-13.** Agent Picks drop `foreign` at regeneration and again
at read (a set outlives the direction change that made it foreign), and mark
stale picks `rereading`; Collections gives an untouched `foreign` match no entry
(a saved job stays); the Next chip names a stale pick only when its search has
no current card. Read paths load currency from the three columns its keys hash
(`targeting.for_currency`, no CV markdown), beside the read it gates — 2-section
waves. On prod, the same 54 people: **19 of 76 picks leave the band** (22 people
hold picks), 20 re-read in place; **46 Collections entries leave across 4 people**;
the lean read and the full Targeting Brief disagree on **0 of every row**.

**S3 shipped 2026-10-13.** `forward_pass.reread_list` on `/users/me` (every
authed page): a profile-only direction test, one Redis claim per person per 15
minutes, one enqueue — nothing else on the read. `matching/list_reread.check`
decides on the Work Lane, with no model call: a **CV no run has read** (the
latest Main CV holds no verdict while an earlier one does) gets `initial_match`
once per CV after the 15-minute grace; **stale cards on the list** get the drain
once per change of rules or facts per day. The drain (`feed_warm.run_feed_warm`)
now reads the person's visible stale cards before the pool on every tick —
including cards the pool window no longer holds — and the bell announces only
jobs that newly join the list. Dry run over the 226 real people active in 30
days, prod data, no writes: 21 re-reads (51 visible stale cards first), 1 CV run,
29 current, 17 with no direction, 158 with no CV.

**Why a CV can have no run:** a Main CV edit — certificate (`certificate_to_cv`),
skill edit, rewrite, merge — writes a new `baseline_upload` and enqueues only
`skill_retag`. The new id moves the direction key, so every verdict reads
`foreign`. On 2026-10-13 18 people's latest CV held no verdict while an earlier
one did (6 of them real PDF uploads whose own run never landed). One is active:
`4f304f53…`, two certificate promotions six seconds apart (cv 652, 653,
2026-10-06 05:17), no run since 04:54.

**S5 shipped 2026-10-13.** The same look files each unanswered Apply click with
no save as `saved` — the rule every click has followed since `3ff55125` — so
"Did you apply?" has a row to ask on; a job dismissed after the click stays
dismissed. Weekly per person. Five clicks from five people (2026-08-20 → 09-20)
were waiting; two of those people have no direction, which is why the door
enqueues for everyone and the worker answers `no_direction` for the list.

**Also found on the way:** `get_user_match_stack` read one PostgREST page, so the
seven people holding more than 1,000 verdicts — all active that month — had
1,397 of them never shown anywhere; it now pages. And `get_pending_apply_intent_job_ids` dropped its
`user_id` and relied on RLS; through a worker's service client it would have
returned every person's clicks. It names the person now.

**Done means:** re-running the batch-1 assessment (memory
`project_instant_seeker_batches`) shows every returning person with ≥1 card when
their pool holds a job worth applying to, and a PROMPT_VERSION bump leaves card
counts unchanged.
