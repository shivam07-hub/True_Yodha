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
| 2 | Apply | click → "Did you submit?" → application, measured | `core_loop_events` + `job_apply_intents` | read `apply_asked` ~10-27; nothing to build before it |
| 3 | Repeat | **#59** golden-list digest · the next hunt after a listing closes | [ARCHITECTURE_GOLDEN_DIGEST.md](ARCHITECTURE_GOLDEN_DIGEST.md) | Built; `0aafb324` on `main`. **BLOCKED on Shivam**: preview → approve |
| 4 | Front door | **#57** "Which job do you want?" after upload | [ARCHITECTURE_FRONT_DOOR.md](ARCHITECTURE_FRONT_DOOR.md) · Cursor, 1st | On `main` 2026-10-17 · link paste fixed `2cc7b264`; 5 clicks to Download `8c372968`; links read from the corpus `515fd697` · phone run owed |
| 5 | Tailor + download | **#58** CV Tier A | [ARCHITECTURE_CV_TIER_A.md](ARCHITECTURE_CV_TIER_A.md) · Cursor, 2nd | S1–S4 on `main` · next S5 add role |
| 1 | Find the job | **#60** a tag must be able to say why it exists | [ARCHITECTURE_SKILL_EVIDENCE.md](ARCHITECTURE_SKILL_EVIDENCE.md) · Cursor, 3rd | Spec only, no commits · S0 audit |
| 6 | Pay | **#56** the ₹199 Apply Pack | [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md) · Cursor, 4th | Spec only, no commits · S1 settlement |

**Cursor's order (Shivam, 2026-10-14):** #57 → #58 → #60 → #56. The biggest
absolute leak first (553 of 1,002 never upload; 511 arrived by partner SSO, 22% of
them upload), then collected → tailored (26%); #60 once jobs flow again; pay after
the value.

Specs Cursor builds from, each slice its own commit with six gates green:
PAYMENTS (#56) · FRONT_DOOR (#57) · CV_TIER_A (#58) · GOLDEN_DIGEST (#59) ·
SKILL_EVIDENCE (#60) ·
[ARCHITECTURE_LISTING_TIME.md](ARCHITECTURE_LISTING_TIME.md) (steps 1–2 done:
de-seed `f7dd4735`, `listing_time.py`; verify 3–6 in code) ·
[ARCHITECTURE_CONTRACTS_BY_TYPE.md](ARCHITECTURE_CONTRACTS_BY_TYPE.md) (make
`compute_match_health`'s `freshness` required).

---

## 1 · FIND THE JOB

**The corpus is the scraper repo's (Shivam).** Landing again since 2026-10-15:
2–3k rows a day, 04–05 UTC; 54,870 active on 2026-10-18. This repo only reads jobs;
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

## 2 · APPLY

The north star is measured here and is near zero: 3 people, 5 applications, ever.
The capture is on `main` (`3ff55125` "Did you submit?"; `a624c2e1` Apply after
download). QA check **A1** below: Apply opens the company's own posting.

**Apply funnel, measured by door (2026-10-13, DECISIONS APPLY1/APPLY2).**
Extension 0.2.3 is live (Page Entry + "I applied"); 0.2.4 names its door.
`loop_reach.py` reads clicked → asked → answered → applied per door, plus the
leading number (tailored apply-outs on ≥3.5 jobs). **2026-10-13 → 10-19, real
accounts: 1 person, 2 clicks, 2 asked, 0 answered.**
**Next:** read `apply_asked` ~10-27. Asked ≈ 0 → people never return to the tab;
asked > 0 and answered ≈ 0 → the prompt is ignored. Redesign from that, in Myro
(no email — APPLY2).

---

## 3 · REPEAT

**#59 Golden-list digest (Shivam, 2026-09-30) — [ARCHITECTURE_GOLDEN_DIGEST.md](ARCHITECTURE_GOLDEN_DIGEST.md).**
`golden_list_since` is live (`20261007120000`) and batch 1 is stamped — Rishabh
Guha, Adarsh Mohan, Raj Kishore, Deveshwar Kashyap (Shivam confirmed 2026-10-07).
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

- **Fixed — a pasted link always failed.** `extractUrl` used the 15s default
  timeout; the server answers in 31–45s, so the door and /market's "Paste a job"
  said "Request timed out." while the server returned 200 (`2cc7b264`, live after
  the next `main` merge).
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
  ~2s; a pasted Genpact link saved as `JR10022480` with no `ext_` row. **After
  the merge:** read the `source=` split on prod for two weeks.
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
  (take_all)`; a reload lands on the paper. **After the merge:** read those four
  steps per person on `core_loop_events` for two weeks — the question is whether
  the editor still loses people before Mentor, and how many answer a question
  before "Weave now". Cost of the design: fewer gap answers banked.
- **FD3 · Small:** the playground header reads "Untitled role" until the job
  loads. On Collections, "Add a job → Save" left the Saved tab at 0 until a
  reload, and a job the person pasted is labelled "Myro found".

T1 findings from the same run are under §5.

**U4 phone run, 2026-10-22** (375px, QA account reset with
`python -m scripts.qa_front_door reset <email> --to skills --apply`, local
Develop backend; Qualcomm and Mindtickle links). Door → Download is **5 taps and
a paste**: Paste a job → paste → Tailor a CV for this → Weave now · 50 → Take
all / Take this → Download CV. Corpus reads in 0.17–0.67s. Fixed on the way:
the review column shrank to 254px (`a63371b0`) · Mentor rendered under the
phone's bars — no close button, Take all under the nav (`0e5f82cd`) · Take
all's version missed the paper until a reload, desktop too (`0e5f82cd`) · a
proving line rewritten into a new one printed twice (`09a51daa`) · weave
failures logged nothing (`09a51daa`). Open:

- **FD4 · the weave outlives its client — on `main` (`dd629e10`).** Server
  74.5s, client 60s: "Request timed out." while the server delivered and
  charged 50, and a Retry before it finished paid for a second run. Measured
  on `coin_ledger`: **12 of 23 weave charges ever came within 3 min of another
  on the same job**; one real person paid **10 × 50 in 42s** on 2026-10-21 —
  `main`'s client put the last question back on screen mid-run, so each
  "Skip & weave · 50" started another run (client half `8c372968`). Now: one
  run per (user, job) holds a Redis claim (`cv_weave_run`); a second POST gets
  409 `weave_in_flight` and the GET reports `weaving`; the work is bounded at
  240s, under the 300s claim. A timed-out POST reads the GET until the
  proposal lands or the run stops (`lib/cv/weave-wait.ts`). Both commits on
  `main` via #344; closes when one real weave hits the claim. **Refunded
  2026-10-22 (REFUND1):** the 9 duplicates of `2ec5bfb0…` (450, ledger rows
  1671–1679, bell row "450 coins returned · Your Cargill draft is waiting.").
  Check scheduled 2026-10-29 (local task `fd4-weave-ledger-check`): same-job
  charges inside 3 min must read 0. Authored 503s pass the boundary
  (`ServiceUnavailable`); still blanked: onboarding first-role save, account
  setup, engagement sale.
- **FD5 · a paid weave that changes almost nothing — price half on `Develop`
  (`2153c9a1`, DECISIONS WEAVE1).** One real person paid 50 for a
  summary-only draft (2026-10-19); the guard refused 4 of 5 roles on the QA's
  last three runs. A weave now costs 50 only when it rewrites or trims a role;
  buttons read "Weave now · up to 50". Forward only — no refund for the
  10-19 draft. **Open: the guard itself** — read `metric
  cv_weave.role_guard_failed` (needs `railway login`) before loosening it.
- **FD6 · the summary names the seat twice.** "GTM Business Development
  Manager at Capgemini… Currently serving as GTM Business Development
  Manager, …" — `names_seat` checks only the employer, so a summary that names
  the role without the company gets `seat_lead` prepended.
- **FD7 · Small:** the phone step rail shows "1" and "2" with no labels; when
  the onboarding state call fails, /onboarding shows "Upload your CV" — a
  person with a CV is invited to upload again.

---

## 5 · TAILOR + DOWNLOAD — #58 · [ARCHITECTURE_CV_TIER_A.md](ARCHITECTURE_CV_TIER_A.md)

On `main`: S1 a blank certification is not a section (`240062eb`) · S2 a tailored
CV cannot invent a role (`7956792a`) · S3 a master rewrite keeps sections the
schema cannot name (`041d2cc3`) · S4 the page meter measures the export and never
refuses a download (`332bec91`).

**Open — S5 add a role or project (#50).** Desktop cannot add a project or a
role; mobile can. `ProjectsBody` returns `null` when `cv.projects.length === 0`
(`cv-paper-sections.tsx`), and `EmptySection` is wired to summary and skills
only. Desktop has `onAddBullet` and `onReorderRoles` but no add-role, delete-role
or move-between-sections; mobile has all three (`mobile-cv-sections.tsx`), gated
at `library-view.tsx` `if (!isDesktop)`. Mobile writes through
`useMasterAutosave` to the **master**, so the one surface that can add a section
edits the wrong document for a tailored CV.

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
  estate portfolio performance". **After the merge:** re-run the method above
  on fresh panels and read 20 proofs by eye.
- **Match reads 0 for almost everyone.** `matchScore` = coverage % − content
  penalty, clamped at 0 (`match-score.ts`). With honest coverage the QA job reads
  33 before the penalty. Re-read the header after the merge before deciding
  whether the penalty belongs in the same number.
- **Summary — FIXED `5ad8f6cc`.** The weave replaced the person's summary with
  "GTM Business Development Manager, Capgemini, Insights & Data (GCC Growth). ▪
  Own the full B2B sales cycle…". Two causes: the seat check matched the whole
  stored company string, so "…at Capgemini" in the summary did not count; and
  `seat_lead()` glued "role, company." to the first raw bullet. Now a summary
  that names the employer is left alone, and otherwise the seat is one sentence
  ("Role at Company.") before the summary's own words — never a bullet.
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
Agent-owned. A scheduled check reads R3/R4 on 10-19.

- **R3 · Live latency.** Five warm samples / a week of `route.latency` on prod for
  `/jobs/feed-state`, `/jobs/at/{c}`, `/companies/{c}/jobs`, confirm-skills,
  `/partner/v1/sso/session`; record in §23–25. First 34 hours (10-12 08:57Z →
  10-13 19:33Z) are in §23–25. The week runs to 10-19. Pre-merge baseline
  (10-05→10-09): p50 ≤50 · ≤50 · ≤100 · ~3000 · ~1000 ms.
- **R4 · SSO 500s gone — FAILED 2026-10-16 15:33 UTC, fixed on Develop.** One
  partner SSO 500 (`ad35b339…`): GoTrue's duplicate-email lookup took 4.8s inside
  a database stall and gotrue re-raised our ReadTimeout as `AuthRetryableError`,
  which the boundary filed as an auth bug. Now a 503 +
  `capacity_503:upstream.read_timeout` (`_relabelled_timeout`), live after the
  next `main` merge. Original check: no `AuthRetryableError: Server disconnected`
  / `CreateRaced` (proofs ride `test_auth_client_http1.py`).
- **R9 · Drain wall time — measured 2026-10-19: about an hour, and one day lost.**
  Scraper jobs since 10-15, first ingest → last `skill_floor_attempted_at`: 66 ·
  65 · 1,441 · 58 · 61 min (10-15 → 10-19); median wait 37–52 min. The expectation
  was minutes. On **10-17** all 3,265 jobs waited ~24h and were attempted at
  10-18 05:04 with the next batch — the day #342 reached `main`; the cause is
  unverified. **Next:** read the worker log for 10-17 05:00–06:00 UTC, then decide
  whether an hour is the claim cadence or the work.
- **R10 · Load off Micro, not a bigger Micro** (2026-10-14). The wait is the
  database, not the app (100 threads, 40 in-flight reads, 100-conn pool already).
  Shipped: `9d4ad00d` (an inert verifier result no longer rewrites the `jobs`
  row; on `main` since #342) and five idle `jobs` indexes dropped
  (`20261015140000`). **Next:** one fresh `pg_stat_statements` window for `jobs`
  HOT share and verifier UPDATE volume, against the 2026-10-15 window in
  `ARCHITECTURE_READ_PATH.md` §28 (HOT 4.9%). `claim_verify_targets` was still
  2.3s a call there. Memory: `docs/agent-memory/project_micro_load_unload.md`.
- **R11 · The digest tells the truth — built on Develop 2026-10-18, live only after
  the next `main` merge** (the closer runs on prod). Three changes: a failed close
  refuses the test in `proof_test` (`49654b13`); a belt with no dead sighting for a
  week clears its failed close (`b3242a86` — `dead_man:job_ingestion` closes at the
  first run after 2026-10-21 02:30 UTC); a slow read inside a three-site minute is
  one `slow_200:db_stall` (`971217e0`). **After the merge:** read two digests. The
  ~25 `slow_read` rows opened by past stalls stay until a new proof closes them; a
  site that keeps opening OUTSIDE a stall is a real query → `/read-path-perf`.
- **R12 · Public pages — the provenance counts are Tier 0.**
  `ARCHITECTURE_READ_PATH.md` §30. Migration `20261019090000` applied (task
  `public_provenance` on `run_snapshot_sql_refresh` at :35, belt
  `dead_man:snapshot.public_provenance`); refresh 3,177ms once a day, read 0.08ms.
  Code `03f6aa41` on `Develop`, live after the next `main` merge. **After the
  merge:** `verified_live` queryid `3154336291968442631` stops gaining calls
  (552 on 10-19 04:25 UTC), the `_count` Notice stops, and
  `cold_fill_wait_expired key=public_stats` reads 0. Company pages (5.3% of DB
  time, no CDN on the path) stay as they are.

---

## AUTHED QA CHECKLIST — the CV machine (from the beta ledger, 2026-09-30)

Agent-owned, never run. **U4 first** — it is #57's acceptance. A check that fails
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
- **U4 · After upload, the next step is obvious.** Acceptance for the front door
  (grill D6: "Which job do you want?"). *The single biggest theme, 17 reports* —
  19 21 27 34 39 41 58 59 79 85 87 89 92 102 106 107 136. **Desktop run
  2026-10-19: the door is obvious; the path behind it is not** — see §4 (fix
  `2cc7b264`, FD1–FD3). **Phone run 2026-10-22: passes at 375px after four
  fixes** — see §4 (FD4 on `main`, FD5–FD7 open). Rerun: `scripts/qa_front_door.py`.
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

- **Scraper: landing again since 2026-10-15** (2–3k rows a day, 04–05 UTC; was
  no feed 10-01 → 10-14). Still yours: Axis Bank = 14,259 live rows (~18%,
  747 titles) — dedupe at the source.
- The prod deploy guard (above).
- **#59 golden digest go-live**: prod carries the first-email rule (`0aafb324`).
  Run the preview SQL in `ARCHITECTURE_GOLDEN_DIGEST.md` (status block), read the
  emails, approve; an agent then adds the schedule.
- Your own phone, 15 minutes on the front door — #57 is on `main` since 10-17.
- **Finlatics API key rotation — deferred until real misuse** (Shivam,
  2026-10-14). The live key travelled in plain email (2026-08-10/11). When it is
  due, order matters — revoking first cuts the SSO door half of signups use:
  `backend/scripts/partner_admin.py key --slug finlatics --scopes sso,…` → hand it over
  through a secret channel → Finlatics swaps → `revoke --prefix <old>`.
- Finlatics, optional: one user's SSO failed 2026-10-06 17:56 (`Server
  disconnected`, fixed `c9a0a047`); their auth account `b4203375…` exists with no
  seat, so their next SSO goes through the consent screen (safe, one extra step).
- `job_switch_plans` + `job_switch_plan_reviews` (0 rows, the retired monthly
  plan): untouched until #56 S5 has removed their code — then ask again (Shivam,
  2026-10-07: payments are core loop; drop nothing early).
- GitHub secrets `MYRO_SMOKE_EMAIL` / `_PASSWORD` / `_API_URL` — the phone render
  gate and `qa:mobile` in CI; until they exist the job warns and skips.
- Send (agent drafts): the 4 users hit by the CV-upload silent failures;
  `094122@fsm.ac.in`, stuck without a target by the five-city 422 (fixed
  `f3f0d0be`); after #56 S1+S3, the 5 Myrology opt-ins get the fixed page.
- Yours or real? `kslk37143`, `zoom8cloud`, `abibi9167`, `p9212530`, `yaya007500`
  — named ones get `is_test_account`.
- #56 §7: Razorpay webhook events, the live key on Vercel, reviewer name + email.

## AGENT CHORES — approved, small

- Run the authed QA checklist, U4 first.

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
