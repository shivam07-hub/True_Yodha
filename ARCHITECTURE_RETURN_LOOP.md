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

**Done means:** re-running the batch-1 assessment (memory
`project_instant_seeker_batches`) shows every returning person with ≥1 card when
their pool holds a job worth applying to, and a PROMPT_VERSION bump leaves card
counts unchanged.
