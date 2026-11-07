# MYRO — Open Work

> Open work only, in the order of the loop map (Shivam, 2026-09-30). Every item
> names the loop step it fixes; anything that fixes none is parked in
> [ARCHIVE.md](ARCHIVE.md) with one line saying why. **Myrology is exempt** — a
> second product line. VERIFY IN CODE before building: entries rot.
> Cockpit: [CLAUDE.md](CLAUDE.md) · the grill that set this order: ARCHIVE, 2026-10-02.
> Pruned 2026-10-19 (ARCHIVE, same date). The text before the prune:
> `git show 48427fbb:BACKLOG.md`.

---

## THE ORDER

Broken steps first, nearest the north star (qualified applications sent) first.

| # | Step | Item | Spec · owner | Next |
|---|---|---|---|---|
| 2 | Apply | click → "Did you submit?" → application, measured | `core_loop_events` + `job_apply_intents` | read 11-02: 6 asked, 2 answered, 0 Yes; too few to redesign from |
| 3 | Repeat | **#59** golden-list digest · the next hunt after a listing closes | [ARCHITECTURE_GOLDEN_DIGEST.md](ARCHITECTURE_GOLDEN_DIGEST.md) | Built; `0aafb324` on `main`. **BLOCKED on Shivam**: preview → approve |
| 4 | Front door | **#57** "Which job do you want?" after upload | [ARCHITECTURE_FRONT_DOOR.md](ARCHITECTURE_FRONT_DOOR.md) · Cursor, 1st | On `main` 2026-10-17 · link paste fixed `2cc7b264`; 5 clicks to Download `8c372968`; links read from the corpus `515fd697` · phone run owed |
| 5 | Tailor + download | **#58** CV Tier A | [ARCHITECTURE_CV_TIER_A.md](ARCHITECTURE_CV_TIER_A.md) · Cursor, 2nd | S1–S4 on `main` · S5 closed 2026-11-04 (`4b9be63d`, on `Develop`) · open: the two match numbers |
| 1 | Find the job | **#60** a tag must be able to say why it exists | [ARCHITECTURE_SKILL_EVIDENCE.md](ARCHITECTURE_SKILL_EVIDENCE.md) · Cursor, 3rd | Spec only, no commits · S0 audit |
| 6 | Pay | **#56** the ₹199 Apply Pack | [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md) · Cursor, 4th | Spec only, no commits · S1 settlement |
| 3 | Repeat | **#61** Myro on Android (TWA), buying hidden, then Play billing | [ARCHITECTURE_APK.md](ARCHITECTURE_APK.md) · Cursor, next | S1–S4 on `Develop`. S6 closed 2026-11-07: phone onboarding shows its step names, and a failed read retries. Next: S7. Phase 2 waits on #56. Shivam: D-U-N-S, new upload key |

**Cursor's order (Shivam, 2026-10-14; #61 added 2026-11-03):** #57 → #58 → #61
Phase 1 → #60 → #56 → #61 Phase 2. The biggest absolute leak first (553 of 1,002
never upload; 511 arrived by partner SSO, 22% of them upload), then collected →
tailored (26%); the app next (Shivam, 2026-11-03: "ready for an APK next"); #60 once
jobs flow again; pay after the value. #61 S5 shipped with #58 S5 (`4b9be63d`). S1–S4 and S6 are on `Develop`. The next open slice is S7. #60, #56, and #61 Phase 2 were not started.

Specs Cursor builds from, each slice its own commit with six gates green:
PAYMENTS (#56) · FRONT_DOOR (#57) · CV_TIER_A (#58) · GOLDEN_DIGEST (#59) ·
SKILL_EVIDENCE (#60) · APK (#61).

---

## 1 · FIND THE JOB

**The corpus is the scraper repo's (Shivam).** Not landing daily (§SHIVAM); when it
lands, 2–3k rows, 04–05 UTC. 54,870 active on 2026-10-18. This repo only reads jobs;
never measure ingestion with `jobs.ingested_at` (an extension save masks a stall).

**#60 Skill evidence — [ARCHITECTURE_SKILL_EVIDENCE.md](ARCHITECTURE_SKILL_EVIDENCE.md)
(Shivam, 2026-10-07). Nothing built as of 2026-10-19.** Stage A tags business jobs
with "Transformation (Genetics)" — 2,637 jobs and growing — and the class is 3,254
qualified skills wide. The key sits in the demand profile, so it weights the Myro
Score and ranks into prep plans as well as matching. Decided: a bare-form tag needs
same-domain support (rule A, proved on prod: Python 97.9% kept, the genetics tag 97%
removed); one name-forms rule for CV and job; Stage A replaces only its own rows,
never on an empty result, versioned by `jobs.skill_floor_version`; receipts
recomputed by `explain_tags`, never stored; an automatic before/after with
invariants; a skill-spread Notice belt. Cursor.

---

**A full run closed jobs that were still open: Accenture (2026-11-02).** Workday's
listing stops at 2,000 while its facets show 34,608 Accenture jobs in India, so a
run called the source complete and closed the rest. Fixed by
[myro-job-scraper#10](https://github.com/shivam07-hub/myro-job-scraper/pull/10)
(`687aebca`): such a run records `partial` and closes nothing. All 2,244 checked on
Workday: 2,102 open and reopened, 12 false notices to real people withdrawn; 142
unproven (126 refused with a 403, 16 with no apply link) left closed. Proved on the
next run: Accenture read `partial`, "source listing stopped before its end"
(2026-11-03 05:04 UTC). Reading past 2,000 needs the listing split by facet:
Shivam's call, it adds JD and enrichment cost.

## 2 · APPLY

The north star is measured here and is near zero: 2 people, 2 applications, ever,
and 4 Yeses not rated yet (`loop_reach.py`, 2026-11-02).
The capture is on `main` (`3ff55125` "Did you submit?"; `a624c2e1` Apply after
download). QA check **A1** below: Apply opens the company's own posting.

**Jobs2Web Apply links land on the company homepage (found 2026-11-02, owner
Shivam: merge).** Stored `/talentcommunity/apply/<id>/` links answer 301 to `/`
for a person too. 5,412 live rows across 14 employers carry one. Fix:
[myro-job-scraper#9](https://github.com/shivam07-hub/myro-job-scraper/pull/9)
stores the job page; the next crawl after merge corrects existing rows. Once no
live row has that path, delete `_listing_page_url` from
`job_listing_verifier.py`.

**Apply funnel, measured by door (2026-10-13, DECISIONS APPLY1/APPLY2).**
Extension 0.2.5 is live on the store since 2026-10-20 (seen 10-22): Page Entry,
"I applied", and the form fill — after the web Yes ("Approve this CV for
filing") it fills the company form, attaches the tailored CV, stops on Submit,
and **Save the confirmation** writes `applied` with door `filing_receipt`.
`loop_reach.py` reads clicked → asked → answered → applied per door, plus the
leading number (tailored apply-outs on ≥3.5 jobs). **2026-10-13 → 10-19, real
accounts: 1 person, 2 clicks, 2 asked, 0 answered.**
**Read 2026-11-02, since 10-20:** 6 asked (3 people) · 4 clicks, 2 answered (1
person), 0 Yes. Too few to redesign from. **Next:** read again as clicks grow.
Asked ≈ 0 → people never return to the tab; asked > 0 and answered ≈ 0 → the
prompt is ignored. Redesign from that, in Myro (no email — APPLY2).

**Form fill has never run for anyone (measured 2026-11-02).** 0 rows in
`job_filing_authorizations`, test accounts included, and `/filing/answers` refuses
without one. The store lists 3 users. Through the real gate: 24 people tailored
29 jobs, 6 of those jobs are gone, 13 judged ≥3.5, 1 passes today, and its drawer
(the only place the Yes lives) was never opened. Of the 13: 9 closed, 5 carry a
side-role overlap, 2 unconfirmed. `career_profile` has no real row, so form fill
would leave pay and notice blank, but that is not the constraint: do not build the
ask until a filing Yes exists.

---

## 3 · REPEAT

**#59 Golden-list digest (Shivam, 2026-09-30) — [ARCHITECTURE_GOLDEN_DIGEST.md](ARCHITECTURE_GOLDEN_DIGEST.md).**
`golden_list_since` is live (`20261007120000`) and batch 1 is stamped — four
people (Shivam confirmed 2026-10-07; names kept off this public repo).
The golden list IS the instant-seeker list: one column,
`user_profiles.golden_list_since timestamptz` (empty = not on it). Shivam sends
names; an agent matches, Shivam confirms, the agent stamps. The digest goes only to
active members: first "you tailored a CV for X — apply", then new Apply-grade jobs
with a Tailor CV link · at most one per 3 days · only when something exists ·
one-click unsubscribe · 0 judge calls.

**Closed listing → next hunt (LOCKED 2026-09-14).** One complete miss — or any
other gone-signal — writes `closed`, the Collection card poofs, and people still
sitting on it get one `listing_vanished` notification. The tailored CV and its
pointers stay (aspiration signal, not a hunt). What is NOT built: the path after
that ping that gets them onto the next live role and through tailor + apply
faster. Do not add a Closed chip back.

---

## 4 · FRONT DOOR — #57 · [ARCHITECTURE_FRONT_DOOR.md](ARCHITECTURE_FRONT_DOOR.md)

After upload, one screen: **"Which job do you want?"** → paste a link or JD (the
existing import, `/jobs/import/*`) · save from any site with the Chrome extension
(desktop only, `EXTENSION_WEBSTORE_URL`) · show me jobs that fit. Every choice
lands in the tailor playground. "Paste a job" also sits at the top of /market and
on mobile. Direction moves **after** the first tailored CV. Target: upload →
tailored CV downloaded in **<10 min, ≤5 clicks**, read from `core_loop_events`.

S0–S5 built 2026-10-14, on `main` 2026-10-17, door telemetry on prod from 10-18.
**Measured 2026-10-19 (real accounts): 36 signups since 10-14 → 10 uploaded →
8 confirmed skills (2 stopped there) → 2 tailored.** Every real person who saw the
door picked "Jobs that fit" (4 of 4: 3 in the lost beacons of 10-17/18 —
FRONT_DOOR §7 S3 — and 1 on 10-19);
none pasted a job. The all-time upload rate is 45%; this week's is 28%.

**U4 desktop run, 2026-10-19** (QA account, dev, Amazon BA link): the door renders
and Paste → review → playground works. Found on the way:

- **FD1 · reading a pasted link — FIXED `515fd697`.** The 31–45s was a dead free
  model at the head of the lane (removed `fe62760f`), not the JD rewrite (30/31
  sentences came back verbatim). The real fault: 5 of the 18 biggest hosts gave
  the reader no text at all (Workday, Oracle Cloud — Kotak, the largest — and
  Infosys draw their posting with JavaScript), so the paste failed. Now
  `job_link_reader` answers cheapest first and logs
  `metric job_import.read source= ms= host=`: **corpus** (89.8% of live jobs carry
  their `job_id` in the link; one primary-key lookup + `page.same_page`; saves the
  listing itself, no `ext_` copy) → **JobPosting** (schema.org on the page) →
  **model**. Verified on real links: Genpact/Workday, Lever, Qualcomm, Amazon,
  Axis, Infosys from the corpus in 0.1–0.2s; Accenture from its JobPosting in
  ~2s; a pasted Genpact link saved as `JR10022480` with no `ext_` row. On `main`
  10-22; the `source=` read is in the next bullet.
- **A link from a job board does not read (measured 2026-11-02).** 11 real links, 0
  read: LinkedIn 5, Indeed 3, Naukri 3 (live that day). 4 links to jobs Myro holds
  read in ~1s. So a board link now says so at once and opens one box for the
  description; Myro reads the role and company from it (`source=board` counts
  arrivals). FD1's owed `source=` read: prod logged 0 reads 10-26 to 11-02, on 1 import call, so there is nothing to split yet. **The
  door is not leaking:** 22 saw it, 21
  took Jobs that fit, 18 finished. 6 people tried Paste or the extension for
  3-16s, 5 of them went on to Jobs that fit; logs show no read for the 2 paste
  clicks they cover (10-30, 11-01).
- **4,279 live listings carry the scraper's stub description** ("No JD provided
  on the company page…", 133 chars) — 4,468 are under 300 chars, measured
  2026-10-20. A paste never answers with one (`MIN_LISTING_JD_CHARS`), but every
  other surface still matches, judges and tailors against them. Kotak's Oracle
  pages are the bulk. Owner: Shivam (scraper repo).
- **FD2 · door to Download — FIXED `8c372968`: 12 clicks → 5.** Paste a job (1)
  → paste the link, it reads itself → Tailor a CV for this (2) → Mentor is
  already open → Weave now · 50 (3) → Take all (4) → Download (5). A job CV that
  was never tailored opens on Mentor once per job, which is aimed at the 4 of 6
  people who opened the editor and pressed nothing. Verified end to end on a
  local backend: `editor_opened → mentor_opened (auto) → weave_ran → review_done
  (take_all)`; a reload lands on the paper. On `main` 10-22. **Read 2026-11-02,
  real accounts since 10-22:** `editor_opened` 3 people, `mentor_opened` 3,
  `weave_ran` 0, `review_done` 0. All 3 stop at Mentor; cause unread. The
  question is how many answer before "Weave now". Cost of the design: fewer gap
  answers banked.
- **FD3 · Small.** The "Untitled role" header while the job loads is fixed
  (`359f4124`, on `Develop`). Open: on Collections, "Add a job → Save" left the
  Saved tab at 0 until a reload. `useManualAdd` already refetches on save and has
  since 09-02, so the cause is elsewhere; it needs a reproduction on the QA
  account. And a pasted job reads "Myro found": `resolve.py` labels any job in
  the match stack `myro`, and `job_applications.source` cannot tell a paste
  apart (every save writes `user_discovery`), so fixing it means recording the
  door at save time.

T1 findings from the same run are under §5.

**U4 phone run, 2026-10-22:** passes at 375px — door → Download in 5 taps and a
paste. Its five fixes are on `main` (ARCHIVE 2026-10-22). Open:

- **FD4 · the weave outlives its client — on `main` (`dd629e10`).** Server
  74.5s, client 60s: "Request timed out." while the server delivered and
  charged 50, and a Retry before it finished paid for a second run. Measured
  on `coin_ledger`: **12 of 23 weave charges ever came within 3 min of another
  on the same job**; one real person paid **10 × 50 in 42s** on 2026-10-21 —
  `main`'s client put the last question back on screen mid-run, so each
  "Skip & weave · 50" started another run (client half `8c372968`). Now: one
  run per (user, job) holds a Redis claim; a second POST gets 409 and the GET
  reports `weaving`; the work is bounded at 240s, under the 300s claim. A
  timed-out POST reads the GET until the proposal lands or the run stops. Both
  commits on `main` via #344; closes when one real weave hits the claim. On
  `main` the claim is `paid_run` (409 `run_in_flight`, client
  `lib/run-wait.ts`), shared with the outreach pack and the day-of brief, which
  carried the same race (GET `building`; 0 real buyers of either 2026-10-22).
  **Refunded 2026-10-22 (REFUND1):** the 9 duplicates of `2ec5bfb0…` (450, ledger rows
  1671–1679, bell row "450 coins returned · Your Cargill draft is waiting.").
  Same-job charges inside 3 min must read 0; read 2026-11-02: no weave charged
  to anyone since 10-22, so that proves nothing yet. Railway, read 10-22: the only prod
  weave runs are that burst — 10 POSTs, 37–60s each, none past the client's
  60s; the 74.5s run was a local backend. Authored 503s pass the boundary
  (`ServiceUnavailable`); still blanked: onboarding first-role save, account
  setup, engagement sale.
- **FD5 · a paid weave that changes almost nothing — price half on `main`
  (`2153c9a1`, DECISIONS WEAVE1).** One real person paid 50 for a
  summary-only draft (2026-10-19); the guard refused 4 of 5 roles on the QA's
  last three runs. A weave now costs 50 only when it rewrites or trims a role;
  buttons read "Weave now · up to 50". Forward only — no refund for the
  10-19 draft. **Open: the guard itself.** Railway read 2026-10-22: no
  `role_guard_failed` lines yet (on `main` since 10:15 UTC, no real weave
  since). Cached proposals: real people 3 of 5 roles refused, QA 4 of 5. The
  metric now names the rule that refused a role: `rule=foreign_number`,
  `number_lost` or `substance_lost` (`025de18d`, on `Develop`). **Next:** once
  real weaves run on it, read the `rule=` split before loosening anything.
- **FD6 · the summary named the seat twice — fixed `228b94c8`, on `Develop`.**
  `names_seat` counted only the employer, so "Currently serving as GTM Business
  Development Manager, …" got "… Manager at Capgemini." prepended. It now counts
  the current role too.
- **FD7 · closed with #61 S6 (2026-11-07).** The phone rail shows "Your CV" and "Your job". A failed onboarding read retries instead of inviting another upload.

---

## 5 · TAILOR + DOWNLOAD — #58 · [ARCHITECTURE_CV_TIER_A.md](ARCHITECTURE_CV_TIER_A.md)

On `main`: S1 a blank certification is not a section (`240062eb`) · S2 a tailored
CV cannot invent a role (`7956792a`) · S3 a master rewrite keeps sections the
schema cannot name (`041d2cc3`) · S4 the page meter measures the export and never
refuses a download (`332bec91`). S5 (add a role or project, and the phone writes
the open CV) is closed — ARCHIVE 2026-11-04, `4b9be63d` on `Develop`.

**T1 findings, U4 run 2026-10-19** (Amazon "Business Analyst, Support, Supply
Chain", QA account):

- **Coverage — FIXED `19dd2389` (Shivam's call, 2026-10-19).** It was near
  zero for everyone since July: all 52 cached panels on prod (676 requirements,
  29 people) had 9 covered and 0 by a CV line. Until 10-17 a cosine band nothing
  reached (requirement ↔ bullet scores 0.16–0.43); since `3b29c282` a phrase rule
  that missed real evidence and proved 63 of its 68 lines on one word ("plan"
  proved "Plan and budget projects"). Now (ARCHITECTURE_JD_REFLECTION.md §0):
  named tools by string; everything else one judgment-lane call per (person,
  job) panel over each requirement's top-3 lines by cosine — stories, bullets,
  skills line, summary — and each proof must quote the words that show it.
  Every reader (interview, weave sole-proof and `why`, projection, Match Eval)
  takes the panel's verdicts. Old panels re-judge on their person's next open.
  Re-judged on prod data, nothing written: QA 1 → 4 of 12, `8ff0c622` 0 → 7 of
  14, `9c360957` 0 → 8 of 14. A panel now takes 9–45s once (was 31–70s: story
  recall is one batch, not one per requirement); the judge call alone is 4–40s.
  Still lenient at the edges: ESG reporting proved "reports on global real
  estate portfolio performance". **Owed, on `main` 10-20:** re-run the method
  above on fresh panels and read 20 proofs by eye.
- **Match reads 0 for almost everyone.** `matchScore` = coverage % − content
  penalty, clamped at 0 (`match-score.ts`). With honest coverage the QA job reads
  33 before the penalty. Re-read the header on a fresh panel before deciding
  whether the penalty belongs in the same number.
- **Two numbers called "match" for one job (found 2026-10-23, making the
  launch videos).** The card's ring is the Match Verdict `match_score` ("82
  Strong" — CONTEXT.md calls it the ONE fit number). The editor header
  ("/100 · Match", `playground-header.tsx`) and the apply window ("match for
  this job", `apply-modal.tsx`) show `matchScore` instead — coverage minus the
  content penalty (`use-playground-model.ts:121`). A person reads one "match"
  on the card and a different one at the moment they apply. **Shivam:** rename
  the CV number (what it measures is how well this CV proves the job) or make
  both read the verdict. Decide with the penalty question above.
- **Copied list markers — FIXED at upload `5ad8f6cc`; offered on the CV page
  `d197a058`.** The parser copied bullets verbatim, so "▪ Built…" was stored and
  the page drew its own mark in front: "• ▪ Built…". Uploads now drop it. The 24
  people whose stored master still carries one (5 active in 30 days, 2 in 7)
  get a Weak `ats · layout` row in the CV editor's Fixes queue — "11 bullets
  print a second mark" — and "Fix all" cleans the open document through the
  editor (undo brings it back). Nothing runs unasked. Upload and page read one
  set of cases (`frontend/lib/cv/list-markers.cases.json`, tested on both
  sides). Verified on the QA master: 11 → 0, every bullet kept, saved.
  **Gap:** the phone editor has no Fixes queue, so a phone-only person is not
  offered it.

Tier B (#48 user-titled sections · #51 outcome not digits · #53 loss notice and
restore · #54 nine screens) is parked until front-door numbers exist — ARCHIVE
2026-10-19.

---

## 6 · PAY — #56

The ₹199 Apply Pack: 500 coins + one 24h Human Check, sold from the out-of-coins
modal and from "Human check before you apply" (ENG2). Spec, slices and Shivam's
checklist: [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md).

---

## PREPARE — parked

Parked 2026-10-14 (Shivam) until **20 people have applied** — Prepare serves people
who sent an application, and 3 have: #45 evidence bank, CS-12, CS-14, CS-15, and
(2026-10-19) CS-16 the role-fold receipt. One line each in ARCHIVE.

---

## GATES — not a step

- **#16 DB capacity — Pro done, compute stays Micro** (Shivam, 2026-10-14).
  Pro lifted the Free size quota that RESTRICTED the project 2026-10-06 22:53 →
  10-09 13:35 UTC. Small was declined (cost). Compute stays Micro:
  `shared_buffers` 224 MB, `max_connections` 60. Do not resize. The ~300ms floor,
  and any read that clears 2s only because the database is this size, stay until
  a query gets cheaper. History: ARCHIVE 2026-10-02 · `ARCHITECTURE_READ_PATH.md` §19.
- **Prod deploy guard — Shivam.** `main` already holds `ea165951`. Confirm
  `curl https://api.himyro.com/health/ready` answers `ready`; then
  `railway variables -s mirror-backend-prod --set PORT=8000`; wait for green;
  then `railway api 'mutation($s: String!, $e: String!) { serviceInstanceUpdate(serviceId: $s, environmentId: $e, input: { healthcheckPath: "/health/ready" }) }' --raw-var s=6f9d873b-0efb-4b30-acc6-dfcfc35d44f0 --raw-var e=f6a22e25-8218-48be-8d89-d380dfbada25`
  and read `Healthcheck succeeded!` on a FRESH deploy. Never the path without the
  port — it broke dev for 14 h on 2026-09-28. Agents are refused prod config.

---

## RELIABILITY — Notice close-out (grill 2026-10-10, Shivam)

Locks: the closer runs from pg_cron (02:30 UTC, 06:30 retry) via
`POST /internal/notice/close`; Notice writes are off the request path; a slow
query opens only at ≥2,000ms; the Railway death harvest is gone. ADR-0021
amended. History: ARCHIVE 2026-10-10, `ARCHITECTURE_READ_PATH.md` §23–25.
Agent-owned. Railway keeps deploy logs 7 days (measured 2026-11-02): read inside that.

- **R3 · Live latency — read 2026-11-02: three routes worse than baseline.** The
  10-12 → 10-19 logs are gone, so `route.latency` 10-26 → 11-02 instead (server
  time, summed buckets, upper edges, cold and warm together; table in §25). p50
  then → now: `/jobs/feed-state` ≤50 → ≤500 (n=62), `/companies/{c}/jobs` ≤100 →
  ≤750 (n=2,693), `/partner/v1/sso/session` ~1000 → ≤3000 (n=21). confirm-skills
  held at ≤3000 (n=14) and leaves. `/jobs/at/{c}` has 2 samples, still owed. Not
  on the list and slowest of all: `GET /jobs/feed` p50 ≤3000, p95 over 8s (n=420).
  **Next:** `/read-path-perf`, `/jobs/feed` first.
- **R9 · Drain wall time — the hour is the work; the lost days were deploys.
  Fixed `ff636796`, on `Develop`.** 11-03's drain floored ~19k jobs in about 63
  min, so an hour is the work, not the claim cadence. The lost days: a deploy
  SIGTERMs the drain and RQ never retries a job killed that way. On 11-02 nine
  worker restarts in 3h17m (05:10 → 07:53 UTC) killed the drain for 12,780 jobs;
  nothing ran in the 9.5 quiet hours after, and they waited for the next scrape,
  25h. 10-27's 3,554 jobs waited a week, and 10-17 was the same pattern. This is
  the `dead_man:skill_floor` failed-close. Now each worker boot queues a drain
  under its Railway deployment id. Live on the worker 2026-11-04 11:53 UTC: both
  replicas logged `metric skill_floor.boot_drain_enqueued`. **Check:** the next
  scrape's jobs settle within about an hour, even on a busy push day.
- **R10 · Load off Micro, not a bigger Micro** (2026-10-14). The wait is the
  database, not the app (100 threads, 40 in-flight reads, 100-conn pool already).
  Shipped: `9d4ad00d` (an inert verifier result no longer rewrites the `jobs`
  row; on `main` since #342) and five idle `jobs` indexes dropped
  (`20261015140000`). **Next:** one fresh `pg_stat_statements` window for `jobs`
  HOT share and verifier UPDATE volume, against the 2026-10-15 window in
  `ARCHITECTURE_READ_PATH.md` §28 (HOT 4.9%). `claim_verify_targets` was still
  2.3s a call there. Memory: `docs/agent-memory/project_micro_load_unload.md`.
- **R13 · Six reads still slow on their own (digests 11-01 → 11-02).** Opened
  outside a stall, so each is a real query → `/read-path-perf`: `_compute` 83→88,
  `_job_demand_counts` 11→14, `fetch_company_jobs_page` 728→730,
  `list_internships` 10→12, `_company_has_listing` 8→9, `list_top_companies_at`
  13→14. The `slow_read` rows opened by past stalls stay until a new proof closes
  them.

---

## AUTHED QA CHECKLIST — the CV machine (from the beta ledger, 2026-09-30)

Agent-owned. U4, #57's acceptance, passed 2026-10-22 (ARCHIVE). A check that fails
becomes a fresh item with evidence; one that passes is struck. Report ids point
into `docs/beta-testing/closure-ledger/beta-feedback-closure-ledger.jsonl` (git).
Phone checks: `npm run qa:mobile` logs in, walks 20 surfaces × 2 themes at 375px
and asserts contrast, squeeze, reach, theme and tap size (credentials in
`frontend/.env.local`); `/dev/phone` is the 375px lab. Neither is a real phone.

- **U1 · Upload on a phone.** Android Chrome, mobile data, a normal PDF: progress
  shows at once, the screen never freezes, it finishes or fails *with a reason*,
  and a retry does not make you pick the file again. *17 reports* — 20 25 30 45
  63 71 75 76 97 111 141 144 (stuck at 20%) 145 146 147 + one unnumbered; same
  hole as the 221 `signed-url` starts with no terminal outcome (#16 §3d).
- **U2 · Hard PDFs parse.** Two-column layout, a scanned/image-heavy PDF, LinkedIn
  and GitHub as embedded hyperlinks, 10th / 12th / college percentages kept
  apart, stack skills (HTML, CSS, JS, MySQL) detected. — 36 46 72 100 105 133
- **U3 · Onboarding on a phone.** The primary-role step waits for your choice;
  every seniority option is tappable. — 96 143
- **T1 · Paste a JD → the CV actually changes toward it.** Bullets rewritten
  against the JD's terms, not generic "add numbers" tips. — 31 66 90 148
- **T2 · Tailoring never swaps in a life you did not live.** Acceptance for the
  fabricated-role guard (grill D7). — 73 126
- **T3 · After a tailored CV, you can find it and act on it** (edit, download,
  apply). — 24 114
- **A1 · Apply opens the company's own posting and never hangs** — not a Google
  search, not an aggregator. — 22 112 128

Archived, not checks (non-machine themes): score unexplained or target role not
editable (11) · job relevance, thin fields, senior roles for freshers, location
and fresher filters (13) · slow score or tab switches (6) · Skills/Forge (9) ·
Tracker (3) · no problem or not actionable (~25).

---

## SHIVAM

- **Brand, agreed 2026-11-02; all need your login.**
  1. Change the Instagram and LinkedIn profile text, and upload the LinkedIn cover
     image: [INSTAGRAM_PROFILE.md](INSTAGRAM_PROFILE.md).
  2. Mark LinkedIn issues 020, 022 and the loop video posted in `/admin/growth`,
     with their links. They are live, and the rows still say unposted.
  3. Listen to the Fill video's soundtrack before Thu 5 Nov.
  4. Connect @myrojobs to the tracker's Publish to Instagram: a Meta app, a token,
     two Railway variables on prod. Six steps in
     [INSTAGRAM_PROFILE.md](INSTAGRAM_PROFILE.md). The button reaches himyro.com
     with the next `main` merge.
- **Key rotation after Railway's 2026-10-21 incident.** The steps, their order and
  what each one checks are kept off this public repo, in the agent's private
  memory on Shivam's laptop. Ask an agent for the list.
- **Scraper: not landing daily.** `job_source_runs` shows 10-14 → 10-20, 10-26 →
  10-27, 11-02 and 11-03, nothing on 10-21 → 10-25 or 10-28 → 11-01 (checked 11-03); was
  no feed 10-01 → 10-14. The 11-02 run after the 10-29 company repairs: Meta, EY
  India and BDO India read `complete`; ANZ Bank `partial`, 11 of 482 (2.3%, under
  the 50% floor).
  Still yours: Axis Bank = 14,259 live rows (~18%,
  747 titles) — dedupe at the source.
- The prod deploy guard (above).
- **#59 golden digest go-live**: prod carries the first-email rule (`0aafb324`).
  Run the preview SQL in `ARCHITECTURE_GOLDEN_DIGEST.md` (status block), read the
  emails, approve; an agent then adds the schedule.
- Your own phone, 15 minutes on the front door — #57 is on `main` since 10-17.
- **Finlatics API key rotation — deferred until real misuse** (Shivam,
  2026-10-14). Why, and the safe order, are in the agent's private memory:
  revoking first cuts the partner SSO door.
- Finlatics, optional: one user's SSO failed 2026-10-06 17:56 (`Server
  disconnected`, fixed `c9a0a047`); their auth account `b4203375…` exists with no
  seat, so their next SSO goes through the consent screen (safe, one extra step).
- `job_switch_plans` + `job_switch_plan_reviews` (0 rows, the retired monthly
  plan): untouched until #56 S5 has removed their code — then ask again (Shivam,
  2026-10-07: payments are core loop; drop nothing early).
- GitHub secrets `MYRO_SMOKE_EMAIL` / `_PASSWORD` / `_API_URL` — the phone render
  gate and `qa:mobile` in CI; until they exist the job warns and skips.
- Send (agent drafts): the 4 users hit by the CV-upload silent failures; one
  person stuck without a target by the five-city 422 (fixed `f3f0d0be`); after
  #56 S1+S3, the 5 Myrology opt-ins get the fixed page. Who: private memory.
- Yours or real? Five unmarked accounts (handles in private memory) — named ones
  get `is_test_account`.
- #56 §7: Razorpay webhook events, the live key on Vercel, reviewer name + email.
- **Scraper, company skills (your repo).** Company skill demand is now a daily
  snapshot in the database (`refresh_company_skill_demand`, 2026-10-29). The
  scraper's `write_company_skill_facts` path (runs only without `--source-only`)
  would be a second writer of `company_skill_profiles`; production never takes
  it. Remove it, then `refresh_company_skill_profiles` and
  `company_skill_run_facts` (26,996 July rows) can be dropped — destructive, your call.
- **Scraper, jobs with no `company_id`.** 1,464 rows (60 live; Amazon 26) come
  from an import path that does not go through `trusted_job_lifecycle`, so the
  same employer is split between an id and none, and those rows are never closed
  by a complete run. Which import writes them? Not filled on our side: that would
  put another source's listings inside a trusted run's close step.

## AGENT CHORES — approved, small

- Run the authed QA checklist.
- **Drop five stored copies — APPROVED (Shivam, 2026-10-27). Earliest 2026-11-08
  (owner: an agent).** `mirror_scores.skill_scores`,
  `user_skills.proficiency_title`, `user_profiles.target_location`,
  `target_location_country`, `target_role_title`. Readers left in #345; writers and
  select lists reached `main` in #346 on 2026-11-01. From 2026-11-08: check nothing
  names them (`pg_stat_statements`), then one migration. Users see nothing.
  CONTEXT → Skill Level, Targeting Brief.
- **Drop twelve onboarding columns — APPROVED (Shivam, 2026-11-01, 11-02). Earliest
  2026-11-09 (owner: an agent).** `user_profiles.onboarding_complete`, `career_goal`,
  `superpower`; `user_onboarding_state.status`, `current_stage`, `result_seen_at`,
  `score_gap_reviewed_at`, `activated_at`, `activation_kind`, `preview_payload`,
  `description_text`, `tailored_cv_created_at`; index
  `idx_user_onboarding_state_status`. Readers and writers reached `main` in #347 on
  2026-11-02. From 2026-11-09: check nothing names them (`pg_stat_statements`), then
  one migration. `test_onboarding_columns_stopped.py` goes with it. CONTEXT → Journey
  Position.
- **Company names on read surfaces onto `company_key`** (CONTEXT → Company
  Identity). The directory, pulse, Company CV Thread and the Following-only
  filter still compare names folded for case and spacing; the resolver's key
  also ignores punctuation. 0 of 278 names disagree today, so nobody sees a
  difference yet. When it is built: pulse and directory keys move with
  `company_pulse.sort_key_for` in one release, since prod reads the snapshot keys.

## COMPANY OBLIGATIONS — off the working backlog

17. **Legal hardening — docs shipped 2026-06-02, counsel sign-off open.** Entity
    is Myro Career Intelligence Private Limited; Terms §07 (payments, XP, refunds),
    DPDP consent at signup, privacy §11 Grievance Redressal (24h ack / 15-day SLA)
    are live. Memory: `project_payment_legal_terms`. **Open — needs Shivam +
    counsel (placeholders live in code):** (a) lawyer review of both docs; (b) CIN
    → `[to be inserted]` in terms §08; (c) a named Grievance Officer, and confirm
    `grievance@himyro.com` exists and is monitored — the SLA is a public
    commitment; (d) full registered office address; (e) confirm Myro is not a
    Significant Data Fiduciary; (f) sign off the INR 5,000 liability cap; (g)
    Myrology refund mechanics vs the final price; (h) EU/UK in-scope check. Verify
    Vercel production `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the `rzp_live_…` pair of the
    backend key. Add: DPDP — confirm the golden-list digest is a service message;
    GST invoicing for a ₹199 digital sale; a Terms §07 refund line for the Apply
    Pack.

## MYROLOGY — the second product line

Exempt from the cut rule, judged on its own revenue (Shivam: "our diamond
product"). Its checkout moves onto Settlement in #56; the stale ₹499 in the
opt-in prompt becomes the catalogue's ₹299. The ₹1,499 / ₹3,999 tiers wait for
the first paid sale. 5 real opt-ins; the 4 stuck ₹499 orders were Shivam's own.

---

## ⚠️ Entries rot in both directions — check before you build AND before you delete

Two failure modes, both already paid for here.

**Stale "not built".** The 2026-07-20 audit found 20 of 23 spot-checked commits
already in `main`, and `cv_weave.py`, `frontend/components/preparations/`,
`prep_brief.py` and `role_dedup.py` all shipped while the tracker said otherwise.
The 2026-10-19 prune found #49, #52 and #47 still written as open after they
shipped. Verify in code before building ([[feedback_verify_backlog_stale]]).

**Stale instructions to destroy something.** 3c told the next agent to drop four
indexes "that only serve the old deployed query". Measured 2026-09-15: all four
carry live scans. Acting on that line would have removed working indexes from the
biggest table on the instance whose capacity is #16's launch blocker. A tracker
line is a claim, not a work order — and the more destructive it is, the more it
owes you a measurement.
