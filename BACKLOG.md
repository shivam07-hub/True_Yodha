# MYRO — Open Work

> Every open item, in full. Ordered by the product goal — see CLAUDE.md.
> VERIFY IN CODE before building any of these. Entries rot.
> Cockpit: [CLAUDE.md](CLAUDE.md)

---

## PRIORITY ORDER

Derived from the goal in [CLAUDE.md](CLAUDE.md), not from the numbering below.
Item numbers are historical and carry no priority meaning.

### Stage 1 — understand the platform, download the CV (NOW)

| Work | Where | State |
|---|---|---|
| Ship `Develop` → `main` | Shivam only | prod blanks after upload today |
| Prove the score persists end-to-end | needs one real signup | fix shipped, never run |
| Upload + download reliability on weak networks | #42, beta ledger | open |
| Real-device authed QA on a phone | #42 | never done · APK blocker |
| Read capacity under concurrent load | #16 | software closed; paid DB capacity gate blocks launch |
| CV rewrite destroys sections the schema can't hold | #47 = #48 | MEASURED: 5 users · path idle since 2026-08-05 · root cause is the closed schema |
| Download gated by a page-fill meter that is wrong | #49 | blocks CVs that fit; passes CVs that spill |

### Stage 2 — job matching through Myro Ops (NEXT)

| Work | Where | State |
|---|---|---|
| Event-driven matching slices 3-5 | #36 | slices 1-2 shipped |
| Ranked job-skill importance | #37 | blocked on scraper repo |
| Semantic retrieval slices 2-3 | Tier 4 | blocked on scraper repo |

### Stage 3 — tailor a CV per job (AFTER)

Engine built. This stage is about making tailoring the obvious next step after a
match, not new machinery.

### Standing obligations — not a stage

| Work | State |
|---|---|
| 113 beta feedback items logged unverified | built ≠ closed; each needs deploy + test + user evidence |
| ₹199 Personalised Engagement | checkout in code; live charges need Razorpay plan id ([OFFERING.md](OFFERING.md) / INFRA.md) |
| Brand token audit · landing visual warmth | #20, approved |
| `qa:mobile` into CI | needs playwright + QA creds as repo secrets |
| Newsletter: Issue 017 OG image · regenerate April dashboards | open |
| Junk job titles at source | belongs in `firecrawl_Supabase`, not here |
| B2B recruiter/referral phase 2 | needs a PRD first — not frontend polish |
| Ghost Job Index: newsletter issue + OG image | index SHIPPED `4d6bb705`→`fa267ce2`; Shivam chose page-first, so distribution is deliberately deferred, not forgotten |

**Decision-gated, do not pick up:** Myrology pricing · legal (#17, counsel) ·
per-skill percentile (#39) · publish portability (#32) · teal-field loading (#18 PR2).

---

## OPEN WORK — VERIFIED 80/20 TRACKER (audited 2026-07-20 · closed items cleared 2026-09-15)

> Audit method: every claim below was checked against `git`/live state, NOT copied from memory or the backlog prose. Re-audit the same way before trusting it — entries rot ([[feedback_verify_backlog_stale]]).

> **2026-08-13 status correction:** Career Ops × verifier parity remains CLOSED
> in backlog #14. Production read capacity #16's software slices are also
> CLOSED on `Develop`; its paid-infrastructure load gate remains the launch
> blocker. Backlog #15 serves active source-grounded, explained, structurally
> valid questions without a human-review gate. Learning progress remains
> isolated from CV-derived score and matching truth. A cleared level can enter
> the Main CV only through the user's explicit, reviewable Skills Refresh or
> evidence-backed Mentor action; no assessment silently rewrites CV truth.

### Scope rule (locked 2026-07-20)

**An agent's work is DONE when it is verified green and pushed to `Develop` with only its own files staged.** Shivam owns the `main` merge; Railway auto-deploys dev from Develop, so the push IS the dev deploy. **Never write "OWED: main merge" or "OWED: deploy dev backend"** — they are not agent-actionable and they poisoned the tracker (see below). OWED lists should carry only: migrations for Shivam to apply, env vars/provisioning, QA needing a real authed session, content to author, or genuinely-unbuilt slices.

### ⚠️ Entries rot in both directions — check before you build AND before you delete

Two failure modes, both already paid for here.

**Stale "not built".** The 2026-07-20 audit found 20 of 23 spot-checked commits
already in `main`, and `cv_weave.py`, `frontend/components/preparations/`,
`prep_brief.py` and `role_dedup.py` all shipped while the tracker said otherwise.
`semantic_candidates.py` was called missing; it lives at
`backend/app/services/matching/`. Verify in code before building
([[feedback_verify_backlog_stale]]).

**Stale instructions to destroy something.** 3c told the next agent to drop four
indexes "that only serve the old deployed query". Measured 2026-09-15: all four
carry live scans. Acting on that line would have removed working indexes from the
biggest table on the instance whose capacity is #16's launch blocker. A tracker
line is a claim, not a work order — and the more destructive it is, the more it
owes you a measurement.

**Cleared 2026-09-15:** twenty-one settled items removed to
[ARCHIVE.md](ARCHIVE.md); #12 and #13 trimmed from 196 lines to their open
residual. This file holds open work. Closed work leaves.

### TIER 1 — do next (high value ÷ low effort)

3. **#16 production read latency — SOFTWARE CLOSED 2026-08-13; PAID CAPACITY GATE BLOCKS LAUNCH.** Original report: Rishabh Guha (`6b624e2e-…`), "credentials not shown after login", 20 Jul ~18:41 IST. Not auth, not data — every authed call returned 200, they just took ~5,200–5,900ms together. **The old diagnosis on this line ("blocked AnyIO/Supabase connection capacity, not compute… measure the pooler ceiling") was wrong and cost follow-up sessions.**

   The code/DB closeout is now complete: verifier claims 3,210ms → 28.6ms;
   the feed plan 8,550ms → 224ms; full descriptions no longer ride the feed;
   the seven current-user context reads are one RPC; shared caches single-flight;
   and `/market` J0 is `/users/me` + `/jobs/feed`, with feed-state, matches,
   applications, notifications and analytics deferred until intent/idle. The
   canonical evidence and exact acceptance gate are in
   `ARCHITECTURE_READ_PATH.md`.

   **External gate:** the shared Supabase organization is Free/Nano. The DB is
   1,118MB (over Nano's 500MB recommended size), `shared_buffers` is 224MB and
   PostgREST exposes 11 sessions. Warm `/jobs/feed` meets the locked backend
   target at 477ms p95, but 10 simultaneous Market arrivals (20 reads) measure
   2,161ms backend p95 with zero errors. Upgrade to paid compute (Small minimum),
   rerun `market_arrival`, and require backend p95 <500ms with zero failures.

   The actual mechanism, and it explains the "**concurrent company-browsing burst**" detail exactly: `shared_buffers` is 224MB, the `jobs` table is 522MB. Every company page ran `company_name ILIKE` → **sequential scan of all 62,225 rows** → the whole buffer cache evicted → the ~20 other in-flight endpoints then read from disk and finished slow *together*. That co-timing was the symptom, never the cause.

   Why the ILIKE seq-scanned: `idx_jobs_company_name_trgm` is partial on `company_name IS NOT NULL AND btrim(company_name) <> ''`, and the planner can only use a partial index when the query proves its predicate. `ILIKE` proves NOT NULL but never the `btrim`. The index existed for months and was never once chosen.

   **Fixed (both live on prod's DB, no deploy needed for the index):**
   - non-partial trigram index — `14,821ms → 19.6ms` on the identical query; live `/companies/{slug}` `5,552ms` + an `8,017ms` 503 → **310–410ms steady**. `database/migrations/20260806_jobs_company_name_trgm_usable.sql`
   - `/jobs/companies/indexable` paged 11,208 rows in 12 OFFSET round trips to count 185 — measured `7,081ms` on prod; now one GROUP BY RPC. `database/migrations/20260806b_indexable_companies_rpc.sql` (code on `Develop`, reaches prod on the next `main` merge)

   **Closed:** `job-listing-verifier` was the biggest shared-DB consumer.
   Constant-time interest bookkeeping plus schedule read models reduced
   `claim_verify_targets(25)` from 3,210ms/14,645 buffers to 28.6ms, and
   `count_verify_due` to 5.6ms.

   **Two reading rules this cost:** rank `pg_stat_statements` by `total_exec_time`, not by what looks slow in the logs. And `max_ms ≈ 7,9xx` does not mean "took 8s" — it means the `authenticator` role's 8s `statement_timeout` killed the query mid-scan. That is what the `/companies` 500s were.

3b. **✅ CLOSED 2026-08-13 — concurrency architecture.** The app-layer defects
that amplified database pressure are fixed; the remaining failed gate is the
measured Free/Nano database ceiling, not unfinished application work.

   - **`ReadCapacityLimiter` caps the whole process at 12 concurrent PostgREST GETs** (`backend/app/services/read_capacity.py`, `supabase_read_max_inflight=12`, 250ms queue → 503). When queries take seconds those 12 slots stay occupied and everyone else gets a 503. This is why `/public/stats` returned at **exactly 1004, 1004, 1004, 1004, 1003ms** — five requests released from one queue together — and it is the source of the `/home/bootstrap` and `/scores/map` 503s in the alert mails. **100s of concurrent users is arithmetically impossible against a 12-slot semaphore.**
   - **Every shared cache is a per-process dict with no single-flight** (`_indexable_companies_cache`, `_pulse_cache`, `_analytics_cache`, `_search_cache`, `/public/stats`). On TTL expiry every concurrent request misses at once and all recompute. It also means **adding replicas makes things worse** — each new process is another cold cache and another stampede.
   - `run_concurrently` builds a **fresh `ThreadPoolExecutor` per call** — unbounded thread creation under load.

   **Governing principle: public read paths must not touch the `jobs` table on the request path.** `/public/stats` already proves it (snapshot-backed, 1.2ms). Ordered plan — the order is load-bearing:
   1. ✅ **DONE** — real search index for `/jobs/search/global` (see item 3c).
   2. ✅ `/jobs/companies/pulse` uses the shared stale-capable cache.
   3. ✅ Shared caches have single-flight cold fills and stale fallback.
   4. ✅ The read limiter is 40 and the shared HTTP transport is bounded to it.
   5. ✅ Re-measured after query and journey fixes. Nano still fails the
      concurrent-arrival acceptance gate, so compute is now the correct next
      lever rather than a mask for unfinished software.

3c. **✅ Global search fixed, and it IS on prod — `cd777acb` is an ancestor of `origin/main` (verified 2026-09-15).** `/jobs/search/global` returned 503 for ordinary words (`engineer`, `manager`) because a five-column `ILIKE` OR seq-scanned 62,225 rows and hit the 8s timeout. Cost tracked how *rare* the user's word was. Replaced with `job_search_index` (materialized view of the five search fields concatenated; the same concatenation `_global_search_rank` already ranks against) + the `search_jobs_global` RPC. Measured: `engineer` 4,284ms → 177ms, `quantum` 12,415ms → 22ms; live dev endpoint 210–1,204ms across every term shape, no 503s. Migrations `20260807_job_search_index.sql` + `20260807a_*_interim.sql`; code `cd777acb`.
   **⚠️ The drop-list on this line was WRONG, and acting on it would have removed live indexes.** It named four interim per-column trigram indexes as serving only the old query. `pg_stat_user_indexes` on prod (stats never reset, so these are lifetime counts) says otherwise: `idx_jobs_job_title_trgm_all` **38** scans, `_location_city_` **65**, `_location_country_` **31**, `_role_domain_` **50**. Non-zero is not proof they are still needed — the counters cannot separate pre-merge from post-merge use — but it IS proof the claim was never measured.
   **The drop is Shivam's call, and it needs a measured window first** (destructive; 22MB + 8MB + 5.7MB + 10MB back on a Nano instance whose capacity is #16's launch blocker, so it is worth doing right). Method: snapshot `idx_scan` for those four plus `idx_jobs_job_title_trgm` (**1** scan, 22MB, built on `coalesce(...)` not the column) and `idx_jobs_company_name_trgm` (**6**, 10MB, partial predicate the planner cannot prove), re-read in a week, and drop only what did not move. Baseline taken 2026-09-15; the two genuine zeroes today are `idx_jobs_job_content_hash` (5.2MB) and `idx_jobs_has_summary` (1.4MB).
### TIER 2 — bounded, meaningful

7. **#33 ₹199 Personalised Engagement — operator remaining** (ENG1 / [OFFERING.md](OFFERING.md)): checkout is Razorpay Subscriptions at 19900 paise / month; one human pass per IST billing month. Still owed by Shivam: create the Razorpay plan, set `RAZORPAY_ENGAGEMENT_PLAN_ID` + webhook events, reviewer email/token. LinkedIn door is `/job-switch-plan?utm_source=linkedin_services`. Do not keep ₹99 as a cheaper CTA.

7b. **✅ CLOSED 2026-09-18 — the tailor's reword now actually reaches the reservoir.**
    The diagnosis was right and the evidence was worse than the note claimed:
    `source="tailor"` had written **zero** rows in the life of the feature, and
    `source="restructure"` — the same positional-anchor bug in `skill_edit.py` —
    stopped at 28 rows on 2026-07-12, the day the last positional point was
    current. Both callers had to GUESS an anchor that matched exactly or the
    write silently did nothing.
    Fixed by deleting the guess: `append_phrasing` no longer takes an anchor. It
    finds the point by its TEXT and the new phrasing inherits the anchor that row
    already carries, so it works for the live `story:{id}` shape and the frozen
    positional one alike. Both callers lost their `_SECTION_TO_LIST` dance.
    Held by `test_cv_job_draft_phrasing.py`.

7c. **Two pointer shapes in `cv_points` — and the "frozen layer" half of this is
    STALE.** *Decision, then a migration. Shivam's call — deleting is destructive.*

    Re-measured 2026-09-18: **2,235 rows, 198 users.** `source="migration"` is
    1,682 rows, all positional, genuinely frozen since 2026-06-24.
    `source="manual"` is 525 rows, all `story:{uuid}`, **last written
    2026-09-17** — that layer is alive and growing, which the old note (407 rows,
    3 users) predated. `source="restructure"` is 28 positional rows, dead since
    2026-07-12.

    The positional rows no longer make 7b lie — the mirror reads either shape now
    — so this is no longer blocking anything. What remains is tidiness: 1,710
    positional rows are 76% of the table and no writer owns them. `story_pointers`
    scopes by `story_id`, so they are inert, not dangerous. Migrate onto stories
    or retire them; either way, one shape. Not urgent.

### TIER 3 — needs a decision or a grill BEFORE code

**Closed listing → next hunt (LOCKED 2026-09-14).** One complete miss — or any other gone-signal — writes `closed`, the Collection card poofs, and people still sitting on it get one `listing_vanished` notification. The tailored CV and its pointers stay (aspiration signal, not a hunt). What is NOT built: the path after that ping that gets them onto the next live role and through tailor + apply faster. Do not add a Closed chip back.

8. **#37 ranked job-skill importance** — `/grill-me` first (ordinal vs weight vs 3-tier; extension-only vs whole matcher; sister-repo scraper coordination).
9. **#36 event-driven matching — Slices 2–5** (notifications inbox/bell → brain-everywhere read audit → Agent Picks auto-gen → "want more" coin expansion). Slice 1 shipped. **✅ Slice 2 VERIFIED ALREADY SHIPPED 2026-07-24** (stale backlog — [[feedback_verify_backlog_stale]]): `NotificationsRepository` + `record_fresh_matches` (debounced, wired into the standardized `run_match` pipeline) + `routers/notifications.py` + `<NotificationBell>` mounted in `authed-top-strip.tsx`, all live on **both Develop and main** (`f76e9e86`/`2115d864`/`519bc677`, none from this session). 11/11 backend tests green. **Remaining: Slices 3 (brain-everywhere read audit) → 4 (Agent Picks auto-gen) → 5 ("want more" coin expansion).** Next agent: confirm which slice to pick up before building — don't assume 3 is next without checking, this same backlog note was already wrong once today.
10. **#20 leftovers** — ✅ ALL DECISIONS CLOSED 2026-07-24. PR-EMPTY shipped · PR-COACHMARKS DROPPED · PR-SIGNUP-REDESIGN DROPPED (ND14) · **PR-REFERRAL-V1 ✅ ALSO ALREADY SHIPPED** (verified in code 2026-08-04: `frontend/lib/referral.ts` + `user_provisioning.credit_referrer_for_signup` → `reward_coins`; the "build the 3 approved items" line below was itself stale) · PR-BRAND-TOKEN-AUDIT APPROVED-build · PR-LANDING-VISUAL-WARMTH APPROVED-build. **Remaining build = 2 items** (brand-token-audit, landing-warmth) + #32 kit-unification. Re-verify each against code first.

11. **#45 The evidence bank — give the horizontal loop a surface.** *Design:
    artboard **2a** in `UNIFIED_PREP_V2.md` (Claude Design project
    `6652e11d-0f4f-4868-95ca-9cf004f30f88`). Needs a grill on shape before code.*

    Prep has two loops. **Vertical** (one room, four steps) works. **Horizontal**
    (one step, every room) is the rail's own headline — *"Clear a step once and
    it counts wherever it applies"* — and it is the claim that makes Myro one
    platform rather than a folder of jobs. **The mechanism now holds it up; the
    interface does not show it.**

    Shipped 2026-09-07, so the carry is real:
    - step 1 — banking a story stales every other room's coverage, which
      re-matches on open (`10043107`)
    - step 2 — always carried; recomputed live from `user_skills` every read
    - step 3 — rehearsal marks the STORY, not the job (`85ac9ead`)
    - step 4 — stays per job, correctly: one conversation, one date

    **What is missing is the surface.** Today the only horizontal thing a user
    can see is one sentence in the cross-room footer, and its link opens a
    single room — the vertical loop wearing a horizontal label. A user who
    answers a gap at Sanofi has just moved four other rooms and is told nothing.

    2a draws the answer: one bank across the top, every room a deposit into it,
    and every gap saying which OTHER rooms it also unblocks. Decide before
    building: is the bank its own route, the top of `/preparations`, or a lens
    on `/cv`? What does a deposit show at the moment it lands?

    ⚠️ Do not start by widening the ladder read. The carries were made free on
    the read path deliberately ([[feedback_record_against_the_person_not_the_occasion]]);
    a bank view that costs a fan-out per room would undo that.

12. **The front door feeds the reservoir — ✅ CLOSED.** `a191350a` made `/cv/upload`
    enqueue an ingest of its own text; verified on a real upload 2026-09-14
    (`cv_dump_entries` holds `source='onboarding_cv'`, that user went from zero
    stories to 3). `806110a8` extended it backwards as a forward pass rather than
    a backfill, and `964f1587` made it visible on the default `/cv` view. History:
    [ARCHIVE.md](ARCHIVE.md), commit messages, and CLAUDE.md § THE FORWARD PASS.

    **What is STILL open, and it is a product call, not a coding task:**
    promoting the gap loop out of prep rooms. Coverage is rung 1 inside a room
    that 328 of 397 CV-holders never open, yet `e91eef0b` built an entire
    reservoir from zero by answering three weave gaps and no dump at all —
    answering a gap is a working front door. Moving that ask to Market,
    Collections or the CV page has real cost either way. **Do not pick it up in a
    coding session.** Memory: `project_reservoir_has_one_inhabitant`.


13. **A CV-born story is thin, and nothing marks it as thin — ✅ CLOSED 2026-09-15.**
    All three grill-locked locks are in code: L1 caps a thin story at `weak` so a
    scraped bullet can evidence a JD requirement but never close it (`cb51d83b`);
    L2 folds a gap answer into the SAME story via `upgrades_story_id`, resolved
    from our cache and never from the client; L3 is the standing completion queue
    (`97f42192`), riding the profile read at no extra fan-out, with
    `completion_declined_at` as its one piece of stored state because ADR-0016
    forbids inventing the number. The 397-user backfill is RETIRED — replaced by
    the forward pass (`806110a8`), which now also has a door on the default `/cv`
    view that hands the questions over in place (`964f1587`).

    ⚠️ **The one thing left is a measurement, not a build: `upgrades_story_id` is
    still 0 in production.** L2's fold has never once run for a real user. Until
    `964f1587` its only door was a prep room 328 of 397 CV-holders never open.
    One non-zero row proves the whole chain — CV in, thin story out, capped at
    `weak`, question asked, answer folded — end to end. Watch that number before
    building anything further on top of the reservoir.

    Two lessons the live data taught, both already in code. **A word count is not
    a missing fact**: `missing_from_pointer` flagged a 17-word line that says
    exactly what it did, so the queue asks only for the number and for a story
    never told — length stays an edit. **The two asks overlap**, so the server
    sends both counts and no reader derives one by subtraction.


14. **Step 2 of the loop reads zero Career Stories.** *Goal-level gap, found
    2026-09-13. Needs a grill: this is the matcher, not a corner.*

    "Find the job closest to your aspiration" runs on the skill layer. Every
    module under `services/matching/` has zero reservoir reads. So the match is
    made against *what skills a CV lists*, never against *what the person
    actually did* — while the stories sit there embedded, with pgvector on them
    and a working cosine already used by the projection. The single biggest
    unexploited asset on the platform.

15. **Step 5 leaves no trail back to the stories.** *Small, but it is what makes
    `repeat` mean something.*

    `cv_of_record` freezes the CV that went out into `cv_application_attempts`
    with zero reservoir references. So Myro knows what you sent and knows what
    you are made of, and cannot join the two: which stories won an interview,
    which never get picked, which phrasing was on the CV that got a reply. Pass
    two of the loop is supposed to be better than pass one; this is the join that
    would make it so.

16. **A role fold still has no receipt, so a confident judge may not fold.**
    *`82f96ac0` turned role auto-fold off rather than ship an irreversible one.*

    `apply_fold` moves every story under the duplicate role, archives the row and
    may widen the survivor's dates, recording none of it — so a wrong fold cannot
    be taken back, and "archive-only, restorable" was never true. Stories can
    auto-fold because `story_identity_fold` writes `moved.dup_added` and `unfold`
    takes back exactly that. Give roles the same receipt and the judge earns the
    write back. Until then every confident verdict is a question for the user.

17. **Practice → certificate → CV is not leaking. Diagnosed 2026-09-13.**
    21 quiz passers, 2 with a Myro certificate line. The 19 others all passed
    between 2026-06-19 and 2026-08-24, before `skill_certificates` existed
    (`01c14fe2`, 2026-08-27). No backfill. Every pass since then (4 attempts,
    2 users) issued a certificate and landed it on the CV — one via Add to CV
    (30 Aug, between issue and auto-write), one via the bulk handler (7 Sep).
    All 21 passers already have a content-bearing baseline, so
    `certificate_to_cv.no_baseline` is not the miss.

    A backfill of ~96 certificates onto 19 CVs from June–August is a product
    call: they did not opt in, and the lines would appear months later.
    Until that call, do not build on this loop. Detail:
    [FEATURE_LOOP_REGISTRY.md](docs/FEATURE_LOOP_REGISTRY.md) L5.

### TIER 4 — correctly deferred, DO NOT pick up

- **#39 per-skill band percentile** — gated on peer density (≥20 per band+skill); at current scale every chip would hide.
- **#32 publish portability** — deferred to 5k users; RAG works, only reproducible re-publish is blocked.
- **#18 PR2 teal-field loading** — vetoed: it decorates a wait that no longer exists (~1.5s post-login).
- **Semantic retrieval Slices 2–3** — **externally blocked** on `firecrawl_Supabase` embed-on-ingest + backfill; Slice 1 is inert until then. Not actionable in this repo.
- **Paid partner plans in Upskilling + Preparations** — deferred to a separate grill/session. Reuse the existing job-gap, assessed-level, project/evidence and preparation architecture; this is a weights-and-connections pass, not a new learning system. Keep free project routes available. The later pass must lock partner catalogue fields, paid disclosure, relevance/ranking, attribution and conversion tracking before implementation. Do not pull this into the landing/Application Plan work.

### SHIVAM-ONLY (no agent action possible)

- `main` merges (all of the above, ongoing).
- Run `recompute_banded_scores.py --apply`; apply the #34 **S6** `20260705_anon_cv_download_events.sql` migration (+ PostgREST reload).
- Provision: `job_switch_reviewer_email` + `job_switch_admin_token` (review delivery 503s without them); confirm Vercel prod `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the live pair. Turnstile stays **off** (arm-on-abuse, #30).
- **#17 counsel-gated legal**: CIN, named Grievance Officer, registered address, liability cap, SDF check.
- Authed browser QA across the many built-but-uneyeballed surfaces (light+dark+375px).

---

## OPEN BACKLOG

46. **Direction = one platform — S1/S2 SHIPPED 2026-09-12, S3/S4/S5 OPEN.** The Direction pipeline answered five questions with fifteen stored answers. ADR-0022 locked the model: **Myro stores closeness between skills and never the one bucket a job or skill belongs to; every fit is a graded score computed from skills.** Measured evidence lives in the ADR and in `CONTEXT.md` §Skill Closeness / §Family Profile — do not re-derive it.

    **✅ S1 Family Profile (`18d45071`, migration `20260912100000`).** `role_family_scope` + `role_family_profile` (1,465 / 124,229 rows) built in the existing refresh. `role_family_demand(families, seniority)` is the ONE reader: 4,311ms → **69ms** warm, and the Career Path band read 2,833ms ×3 → **9ms**. `is_primary` is off the demand path (Lock 4) — it is `required_level = 4` restated on Stage A rows and a 94.7% constant on the 296,886 legacy enrichment rows. That moved 460 of Software Development's 2,096 skills from a level-3 target to level 2, deliberately. The target-level rule now lives ONLY in `scoring.demand_rule`; the repository returns counts and stopped interpreting. Also added `role_family_labels.bands` (≥25% rule: 212 directions in one band, 95 in two, 4 in three, 19 in none).

    **✅ S2 Skill Closeness (`dec41c89`, migrations `20260912110000` + `…120000`).** `skill_closeness`, 7,287 bonds over 1,122 skills, own Tier-0 task, ~28.6s per ingest. Bonds counted **across companies** (≥3 companies, no single one over half) because 67.4% of raw bonds were one employer's template. Retired `role_family_market_skills`, `role_family_band_market_skills`, `role_family_aspiration_skills` after verifying zero callers.

    **✅ S3 Band step — SHIPPED 2026-09-13 (`48e751d5`, `5035af5f`, migration `20260913100000`). ⚠️ No authed run.** Asked first (`band → work → level → where → about`), **pre-answered and never blocking**: the best-fitting band arrives ticked and Continue stays enabled. A wall in front of a step converting at 76% was the risk not worth taking, and a ticked answer the person changes is still their answer — the same rule the level step has always followed. The landing rule skips the step for anyone who has answered. `p_bands` narrows SUGGESTIONS only; **search stays global**, and a direction picked from outside your fields widens them (`list_role_families` now returns `bands`).

    **The counts could not be live.** Measured 2026-09-13: `group by career_band` over live jobs is **14,393ms cold / 7,080ms warm**, 12,497 blocks read. So `career_band_scope` (four rows) is filled inside `refresh_role_family_labels` from the scan it already makes for `role_family_labels.bands` — nothing new read per ingest. Band fit is index-only at **9.2ms**. Live figures: Business/Product/Ops **20,659 jobs · 154 directions**, Engineering/Data **17,960 · 235**, Research/People **945 · 33**, Design & Creative **234 · 8**. ⚠️ `family_count` counts directions under the **≥25% rule**, the same one `p_bands` filters on — counted off raw jobs it reads 71 for Design & Creative where the next screen offers 8.

    **The write was the real defect.** Direction saves the band and the roles in ONE `save_target`, and the roles won: `targeting_write` recomputed both band columns from the title regex on every save, so the band chosen at step one was erased by the call that stored it. Now `explored_career_bands` holds the **whole explicit answer, primary first**, and only an explicit pick writes it (`chosen_bands_for_profile`). That is also what makes "nobody has been asked" (empty) readable apart from "chose exactly one band". A second target role still opens its band — derived at read time in `eligible_bands_for_profile`, where it can be removed and does not resurrect itself. **10 profiles were backfilled**; without it they would have silently lost their primary band from the feed.

    **One control, not two.** The backlog said to reuse the multi-select in `filters-sheet.tsx`; there wasn't one — three "Also explore X" switches around a derived primary, the only band UI in the app, encoding the model this replaces. `components/target-role/band-choice.tsx` is now shared by Direction, the filters sheet and Settings (`BandSettings`, beside Target Roles), and `primaryCareerBand` is gone from the sheet, the jobs tab, the mobile surface and the market page. Verified at 375 and desktop in both themes against fixed data; **the step itself has never been driven authed** — the QA account stalls at `awaiting_skill_confirmation`, before Direction.

    **OPEN — S4 Graded job ↔ direction fit. ⚠️ MEASURED 2026-09-13 AND DEFERRED — it needs the paid DB compute gate, not more design.**
    The rule is right and Pareto-better (**76% precision / 40% reach** against the bucket's 71%/29%). The cost is the problem. On the shared Nano instance, against 46,801 live jobs:

    | how | cost |
    |---|---|
    | today's bucket lookup (`role_family = any(...)`) | indexed, milliseconds |
    | graded per request, naive join | **23.2s** |
    | graded per request, reshaped so skill hits drive the lookup | **5.8s** |
    | precomputed per ingest (top-12 skills/family, ≥2 matched, capped 500/family) | **13.8s for the 50 largest families**, 25MB temp spill → extrapolates to ~60–90s and ~170MB spill for all 330 |

    The precompute produces only ~20k rows for the 50 biggest families (≈60–80k for all), so storage is fine; the *build* is the cost, on a database already holding 1,118MB against a 500MB recommended size with 224MB `shared_buffers`. Same gate as #16.

    **Do not ship half of it.** Shipping the cheap half (the feed's role signal, which needs no new read — `main_skills` is already selected and `top_skills` is already on `role_family_labels`) while the candidate-pool selector keeps the bucket lookup would give the platform **two definitions of "does this job fit the direction"** — exactly the drift S1/S2 removed. One definition or none.

    When compute allows, the shape is: a `role_family_pool(family, job_id, matched)` snapshot built in the same refresh, read by BOTH the selector and the feed so the definition stays single. Only then can `role_family_for_job`, `trg_refresh_job_role_family` and the column retire. Original notes:  Replace the remaining `jobs.role_family` reads (feed `_role_match_score`, `job_matcher` ROLE_BOOST, `get_candidate_job_ids_for_roles`, `roles_feed`, `partner/roles`, `refresh_sector_panel`) with "the job asks for ≥2 of the direction's characteristic skills": measured **76% precision / 40% reach** against the current bucket's 71%/29% — better on both. The feed can compute it with no extra read (`main_skills` is already selected and `top_skills` are display names; the two agree — 100% of scraper names are Stage A names). The candidate-pool selector needs an RPC over `job_skills` by `skill_id`. Only once these are gone can `role_family_for_job`, `trg_refresh_job_role_family` (per-row, ~2.9ms × 2 per skill row, ~57 min per two weeks of ingest) and the column itself retire.

    **✅ S5 Prep ranks by closeness — SHIPPED 2026-09-14 (`bfc87170`, migration `20260914100000`). ⚠️ No authed run.** `compute_gap_skills` folds `skill_closeness` into `_priority`, normalised within the candidate set. This is the FIRST reader `skill_closeness` has ever had — S2 built 7,287 bonds and shipped with none, so "learn what is next to what you know" was a product claim with no code behind it. One RPC, **6.0ms as `authenticated`**, run inside the recompute's wave beside the family-market read rather than after it (a sequential hop on this path is ~165ms). Keyed on `taxonomy_key`, so it takes no user id and stays SECURITY INVOKER instead of becoming an oracle.

    **Closeness only LIFTS, capped at 0.5.** Measured over 37 users with a target: a bond exists for **4.3%** of the whole demand vocabulary and **15.1%** of the top 25, where the five slots are actually decided — because 55% of the skills people hold appear in fewer than 20 live jobs and are excluded from bonding on purpose. Demoting the unbonded would let a silent 85% decide the list. Effect: **7 of 15 users get a different top five**, one slot each; for one, Performance Management (demand 568, bonded) rose 6→3 over Financial Services (578, unbonded) while the head of the list held. `ln(1+lift)`, not lift — raw lift is decided by one lucky edge (Gitlab 216.7 on ONE bond over Kubernetes 67.4 on two). Full numbers: [ARCHITECTURE_READ_PATH.md](ARCHITECTURE_READ_PATH.md) §19.

    **OPEN, small — the "why" copy.** Closeness is deliberately not in the payload: a number no surface renders is the next dead field. The card that earns it names the neighbours ("asked for alongside React and TypeScript, which you already have") and needs the neighbour NAMES the current read does not fetch — a payload change plus one line of copy, replacing the generic "In demand right now".

    ⚠️ **One bad taxonomy mapping is ranking nonsense into prep plans, platform-wide.** A business/sales user's rank-2 gap is **"Transformation (Genetics)"** — a genetics term matched off the word "transformation" in business job text. It sits in **101 role families across 1,645 live jobs**, three times the reach of the real skill it is crowding out ("Business Transformation": 37 families, 556 jobs). Closeness neither caused it nor fixes it — it made it visible. **Checked and it is isolated**: no other skill with a scientific-domain parenthetical reaches 20+ families. The fix is one Stage-A mapping, but remapping 1,645 rows is destructive and needs Shivam. ⚠️ Not just a prep-plan defect — this key is in the demand profile, so it also weights the score.

    **Still true and deliberately unfixed:** a family's profile is only as good as the jobs it is built from. "Data Analysis" holds 224 jobs of which 10 are data-analyst jobs, and the closeness graph already found the real bundle (Tableau, Snowflake, Data Pipelines, Data Governance). Seeding profiles from bonds instead of the modal-cluster vote is the next question after S4 — and with this architecture it changes one refresh step, not any consumer.


42. **Mobile unification pass + the render gate — 6 commits BUILT + pushed Develop 2026-07-27. Slices 1–2 DONE, slice 3 (orphan surfaces) OPEN.** Trigger: Shivam dropped 13 mobile screenshots — *"crossing all our design philosophy and standardisation… in some areas the font is fucked up, in some the hierarchy is not maintained, in some the colour is fucked up"* — plus Railway logs, plus *"we need to work on building the APK, and this is the final pass to unify the product as one."*

    **ROOT CAUSE — one thing, not many.** The app ran **two design systems in one frame**, by design. `mobile/redesign/redesign.css` states it: *"Scoped under `.mm-root` so it never touches desktop web-chrome or the untouched CV surface."* `.mm-root` covered 7 things (top bar, bottom nav, Jobs, Collections, Profile, sheets, agent picks) and NOT: CV, Preparations, Skills/Score, Coin guide, Intel, Settings, footer. Chrome hardcoded dark; content followed `[data-surface]`. **The visible mechanism was one line**: `.tm-main-scroll` painted `var(--mm-bg, #191918)` unconditionally at ≤768px — a deliberate workaround so light body paper wouldn't flash behind the fixed dark bars. Consequence: every non-`mm-root` surface got a dark canvas while its content rendered light-mode text tokens → near-black headings on a near-black page with their own subheadings still legible. That is every "invisible heading" in the screenshots. **Third occurrence of this failure class** (cf. the `.db` token-scope bug 2026-06-14, myrology's `:root,.myrology-root` join in #28): background owner and text-token owner differ, nothing checks they agree.

    **⚠️ CANONICAL DARK CHANGED — supersedes #28 and any memory quoting `#0a0a0c`/`#13141a`.** Two corrections future agents must not re-derive: (a) #28's documented dark was ALREADY stale — the palette was warmed 2026-06-16 to `#100c09`/`#1b1611`; (b) it is NOW `#191918`/`#212120`, `mm`'s ramp adopted wholesale (Shivam: *"the present jobs, collections are the ideal for phone"*). Text ramp moved with it (`#f2f2ee`/`#a6a69e`/`#8b8b84`/`#71716a`) — taken as a SET, because mixing a neutral page with the old warm-cream text is what caused the mismatch. Light was `#faf6f0`/`#fffdfa` (Firecrawl paper) at the time of this entry; **superseded 2026-08-23** by cool ash `#f3f7f9`/`#fbfeff` when the accent unified across surfaces. `design-tokens.css` is the value; this line is history. **Deliberate cold-console islands kept**: landing engine pipeline, sample readout, intel pane.

    **LOCKED DECISIONS (Shivam, via AskUserQuestion):** follow-OS done properly (both themes, one flag end-to-end) · `mm` visual language is the mobile standard, folded into ONE token system · **platform stack at every width** (`--tm-font-sans`; Grotesk/Inter unloaded 2026-09-12) · warm dark canonical site-wide · all 7 orphan surfaces before APK · junk titles = frontend guard now, scraper later.

    **SHIPPED:** `812c2906` one dark/one flag (`--mm-*` became an alias layer over `--tm-*`; chrome follows the flag; retired `#0a0a0c` from `themeColor`/offline/myrology) · `cf9a9ef5` tokenized **182 pinned colour literals** across 12 files (the redesign was ported "to the dot" with inline hexes, so aliasing alone was insufficient; 11 decoration greys became surface-relative `color-mix` steps that invert per theme; zero hex literals left in `mobile/`) · `10e40a11` the `.tm-main-scroll` canvas fix · `767e914d` the render gate · `d1d448bd` coin-guide row + opaque bottom nav + gate extension · `edf1abb4` accent ration + junk-title guard.

    **Phone lab (dev only):** `/dev/phone` — 375×812 iframe of chrome + the route skeleton (Load) or the real authed tab (Live, after **QA session**). Same viewport as `qa:mobile`. Production 404s `/dev`. This is the agent eyeball; it is not a real phone.

    **🔑 THE TOOL — `npm run qa:mobile` (`scripts/qa-mobile-capture.py`). USE IT.** Logs into a real authed session, walks **20** surfaces × 2 themes at 375px, and **asserts rather than captures** (screenshots a human must remember to review are homework, not a gate). **Five** probes — the three added 2026-08-27 are described below; the original two: **contrast** — resolves the background each `h1/h2/h3` is REALLY painted on by walking ancestors past transparent fills, fails below WCAG AA; **squeeze** — any leaf text node whose line count approaches its word count is a starved column. Both **falsified**: reverting each fix reproduces the exact symptom (`light/cv <h1> "My CV" 1.14:1`; `dark/tokens "Clear a skill level" 4 lines / 4 words in 39px`). Credentials from `frontend/.env.local` (`MYRO_TEST_EMAIL`/`MYRO_TEST_PASSWORD`), read server-side only; in CI from three repo secrets. Add a route to `SURFACES` the day it becomes reachable — `/tokens` was uncovered, which is why the worst layout break of the July pass was invisible, and the August sweep found five more the same way.

    **WHY THIS WENT UNSEEN FOR MONTHS (do not repeat):** (1) `brand-system.test.ts` asserted the retired hexes and had been **RED since the 2026-06-16 warming** — logged in session notes as *"1 PRE-EXISTING warm-token hex fail"* and treated as background noise. A red check with no owner is not a check. It now asserts live values AND carries a rot-resistant companion that encodes the invariant instead of the hex (cards must lift above their page; primary ≥7:1, muted ≥4.5:1 against its OWN surface). (2) `mobile/redesign/` is **EXEMPT from `ui-drift-guard`** as a "mobile primitive layer" — precisely how 182 literals accumulated invisibly. Narrow that exemption to the CSS file once the surfaces stop hand-rolling colour. (3) Nothing in the pipeline rendered anything. `tsc` reads types, `eslint` reads syntax, `ui-drift-guard` reads file contents. **Ask for a QA login and LOOK — do not infer.**

    **TWO DEV-LOOP TRAPS, now preflighted by the gate:** (a) `NEXT_PUBLIC_API_URL=http://localhost:8000` with no uvicorn running → login dies with a bare *"Network request failed"* and no hint the API is absent (`.env.local` now defaults to the dev backend; `.env.example` documents it). (b) A stale `.next` reports *"Ready in 1.3s"* then serves `text/html` 404s for `/_next/static` chunks → the page never hydrates and **no click registers** (added `npm run dev:clean`).

    **2026-08-27 SWEEP — slice 3 is smaller than this entry claimed, and five other things were worse.** The gate passed while all of it shipped, because it walked 8 of ~30 phone-reachable routes and asked two questions of each. It now walks 20 and asks five; `mobile-render-gate.yml` runs it on every frontend change. **⚠️ Needs Shivam: three repo secrets** — `MYRO_SMOKE_EMAIL`, `MYRO_SMOKE_PASSWORD`, `MYRO_SMOKE_API_URL` — until they exist the job warns and skips rather than passing quietly.

    **Three new probes, each earned by a defect they now reproduce.** `unreachable`: a control or panel cut off by a non-scrollable ancestor, or past the viewport with nothing clipping it — this is why `scrollWidth` can never be the probe, and it is what found three nav tabs 36/84/143px off the right edge of every public route and /myrology's whole pricing panel 101px past it. `theme`: what the content is REALLY painted on, sampled at 8 points, must match the theme asked for — the contrast probe cannot see this class, because black on white clears AA while the bars above and below stay dark. `tap`: WCAG 2.2 AA 2.5.8, below 24x24. Two traps in building them, both recorded in the script: marquees are excluded by an INFINITE animation, not by "has an animation" (the nav's own 0.42s entrance reveal hid all three clipped tabs behind the looser rule); and a horizontal cut is only reachable through horizontal scrolling — `body { overflow-x: hidden; overflow-y: auto }` read as scrollable and hid a whole panel.

    **FIXED (`bf01826a`→`afbe4ab8`, 7 commits):** the authed strip had no phone layout, so a signed-in visitor tapping Newsletter or Myrology from Profile got the desktop bar with its tabs off-screen AND lost the 4-tab bar — no way back that wasn't itself clipped; the split now lives inside `AuthedTopStripStandalone` where both callers inherit it (`redesign.css` moved to `mobile/shell.tsx` with it — it was imported by the app shell alone, so the bars rendered `.mm-root` markup with no `--mm-*` declared) · 37 pointer targets under 24px, worst the 15x15 skill-confirmation checkboxes on the stage-one path · the /onboarding/result pane tabs, a second fixed element pinned at `bottom: 7rem` guessing that bar's content-driven height and missing by 105px, now its top row · /beta-feedback's 26 pinned light hexes (white sheet inside dark chrome) · /myrology's price row, whose responsive collapse sat in a file imported BEFORE the one declaring the base — a media query adds no specificity — plus an `<h1>` at 1.14:1 in light, because `color` inherits as a RESOLVED colour and the forced-dark island never re-resolved it · `.tm-skeleton` capped at `max-width: 100%` (19 fixed-px shapes across 5 route mirrors, wider than the page they load into).

    **CLOSED, did not reproduce — verify before rebuilding:** the **clipped Settings modal** (`.tm-settings-body` is `overflowY: auto`; the mobile block gives a full-height sheet with a 4-col tab grid — Appearance is a section inside Account, reached by scrolling) and the **desktop footer on a phone** (it gained 480/360 breakpoints; at 375 it is 3 readable columns and every link now clears 24px). The **shared-nav 498px blow-out** is closed by the phone chrome above.

    **STILL OPEN:** (1) **`ui-drift-guard` gained `pinnedColourLiteral`** — hex colours in CSS declarations, baselined at 226 as a ratchet, not a ban. The deliberate theme-independent islands (intel-pane's cold console, the CV sheet's paper, the mobile template thumbnails) hold where they are; the number may only go down. (2) **Accent budget never reached the orphan surfaces** — /practice shows two full-width azure buttons, an azure chip and orange in one viewport. `edf1abb4` rationed Jobs and Collections only. ~~/preparations gives all five Training rows the azure outline AND azure text~~ — closed by Unified Prep v2 (`4506a4e1`): the rail shows three programmes and accent is spent on the ONE that matches a gap on the board. (3) **/skills is a dead page** for an account with no score: one "Score map unavailable" card and ~1000px of void. That is an empty-state decision, not a bug fix — needs a brief. (4) **Junk titles at source** — `displayJobTitle` is display-only; the extractor fix belongs in `firecrawl_Supabase`. (5) **`mobile/redesign/` is still exempt from the drift guard**, as this entry has said since July.

    **⚠️ STILL UNEYEBALLED:** the accent-budget change from `edf1abb4` — the QA account has zero tailored-but-unapplied jobs, so `.tm-lib-continue` renders 0 cards and the lane never appears. Seed it, or look on a real account. Separately, **nobody has opened any of this on a real phone** — every measurement here is a 375px Chromium at device-scale 2.

    **⚠️ VERIFICATION GAP (own it, don't paper over it):** the accent-budget change is green by code + tests but **NOT eyeballed** — the QA account has zero tailored-but-unapplied jobs, so `.tm-lib-continue` renders 0 sections / 0 cards and the lane never appears. Seed the QA account with a tailored job, or eyeball on a real account, before calling it done.

    **Also fixed in passing:** `displayJobTitle` nearly shipped as a duplicate — `lib/text/strip-markdown` already had `cleanJobTitle` used by 3 surfaces. Different concern (formatting vs meaning), so they now COMPOSE; `displayJobTitle(title, company)` is the single entry point. Grep before building a util.

41. **Perceived-speed contract — login critical path + CV FOUC (GRILL-LOCKED 2026-07-21, mostly NOT built).** Trigger: Rishabh Guha "credentials not shown after login" (20 Jul ~18:41 IST) → diagnosed as prod read-latency, not auth (Tier-1 #3 above has the evidence). Root problem: **login fires ~25 requests where ~4 would do**, they queue, and the app sits on 5–6s blank loading states. Shivam: *"speed visible to users is the core philosophy we started with and it is not implemented."*

    **LOCKED CONTRACT (grill 2026-07-21, 4 decisions):** **(L1) First paint = identity + score + feed.** Nav (name/avatar/coins) + Myro Score + the feed's first rows. `/home/bootstrap` already covers identity+score in ONE call; feed is why they came. Everything else defers. Target ~4 critical requests. **(L2) Returning user = stale-while-revalidate WITH a visible refreshing hint** — paint last session's cached name/score/coins instantly (<300ms, LinkedIn pattern), refetch in background, and show a subtle indicator while refreshing so a changing number is explained, never a surprise. **(L3) DEFER off the critical path** (Shivam-selected): market analytics + heatmap (incl. the 25s `/jobs/analytics`), the 4 onboarding widgets (`checklist`/`state`/`result`/`role-readiness`), and skill-demand + `/scores/map` + `/users/me/following`. **NOT deferred — Agent Picks band stays** (deliberately not selected; it's part of the feed's value). **(L4) CV route shows a skeleton of the REAL CV layout** (`CVPlaygroundSkeleton` already exists) — the flash is a bug to root-cause, not a spec change.

    **AUDIT FINDINGS (measured from his session, do NOT re-derive):** `/home/bootstrap` is a correct BFF — bundles 8 sections server-side AND seeds all 8 react-query keys; `MissionHeroRail`'s leaf queries are properly gated on `settled`, so they do NOT race it. ⚠️ **Two earlier claims were WRONG and are corrected here:** (a) there is NO 3× `users.me` — `dataKeys.profile()` IS `["profile"]`, so shell + market always shared one cache entry and the log shows it firing once; (b) the `/companies/{name}` 404s are correct behaviour (reviews empty-state, `application_reviews` has 1 row), slow only because the whole backend was queuing. **The real residual dedup gap is small and already documented in `use-home-bootstrap.ts`'s docstring**: shell `useShellModel` (`users.me`) and nav `ScoreChip` (`scores.me`) fire UNGATED because they mount on every authed page and must not couple to a home-only BFF — ~2 extra light calls, NOT the cause of the 5–6s. **The dominant cost is the L3 deferral list**: `/jobs/analytics` 22–25s · `/jobs/analytics/me` ×3 (one per target role, `chipCountQueries` in market/page.tsx) · `/jobs/my-skills/demand` 3.5–9s · `/onboarding/role-readiness` 5.8–19.5s · `/scores/map` + `/users/me/following` ~5.2s each.

    **DONE:** `3b9a16a5` market page uses canonical `dataKeys.profile()` for query + invalidation (hygiene — two spellings of one key is how a BFF seed silently misses its consumer; NOT a behaviour fix).

    **⚠️ L3 REFINED 2026-07-21 → THREE WAVES (Shivam).** Shivam's question: *"shouldn't the deferred analytics/heatmap fire right after the other loading completes, rather than waiting for intent?"* Half-right, and the correction matters: **a cascade moves server load, it does not reduce it.** Rishabh's failure was ~25 requests saturating ONE backend's pool — firing the same set two seconds later re-forms the same queue under concurrent logins, and most users never open the heatmap, so it is paid-for waste. So tier by **likelihood-of-use × cost**, not by timing alone: **WAVE 1 (immediate, critical):** identity + score + feed + Agent Picks band — nothing else. **WAVE 2 (auto-cascade — Shivam's idea, correct for this tier):** fires on idle AFTER wave 1 settles, via `requestIdleCallback`/after-paint (NOT a bare `useEffect`), low-priority and cancellable on navigate so it can never compete with wave 1 for main-thread or connection slots — `/scores/map`, `/users/me/following`, `/jobs/my-skills/demand` (cheap + likely used → ready before the user scrolls, no later spinner). **WAVE 3 (on-intent ONLY, never speculative):** `/jobs/analytics` (**22–25s**), the heatmap, `chipCountQueries` (`/jobs/analytics/me`, one per target role), the 4 onboarding widgets. **HARD RULE: a 25-second aggregation must never fire on login** — it is the single biggest contributor to the saturation that made a real user's session read as broken; only a user who actually asked for it pays for it. **Success test: login triggers `/jobs/analytics` ZERO times.**

    **✅ BUILT + pushed Develop 2026-07-21 (3 commits `a319255c`+`9d56d2e7`+`d1e57704`; Part 4 = numbers-backed recommendation, no code).** (1) **✅ L3 three-wave loading** (`a319255c`) — new `lib/hooks/use-load-waves.ts` (`useIdleWave` = wave-2 idle cascade after bootstrap settles, cancels on navigate; `useIntentWave` = wave-3 arm on first scroll/pointer/key). Wave 1 (BFF bootstrap + feed + Agent Picks) unchanged. Wave 2 = `/scores/map` (SkillMapCard render-gated) + `/users/me/following` (`useFollowCompany({enabled})`). Wave 3 = `/jobs/analytics` (movers via `useMarketIntel(..., enabled)` threaded through jobs-tab + market-rail; `loading` stays false when disabled → no eternal skeleton) + `/jobs/analytics/me` chip counts. **Measured:** cold /market login dropped from ~14-16 eager requests to ~4-6; **`/jobs/analytics` fires ZERO times on login** (the success test — it only fires on the user's first interaction). The 4 onboarding widgets + heatmap were already OFF /market (mount on /collections + /onboarding + /intel, not the login landing) — no change needed there. (2) **✅ L2 SWR + refreshing hint** (`9d56d2e7`) — new `lib/identity-cache.ts`; profile (nav name, in `use-shell-model`) + score (`ScoreChip`) seed React-Query `initialData` from a per-user localStorage snapshot with the OLD timestamp → paint <300ms AND still revalidate. Score-chip ring breathes while `isFetching` (reduced-motion → dimmed). Coins already did this via zustand-persist. (3) **✅ L4 CV FOUC — root-caused with evidence, fixed (NOT a code-split)** (`d1e57704`). Evidence: `cv-builder.css` compiles to a **79KB route-scoped chunk** (`a7a4…css`) mapped ONLY to the 5 `/cv` routes, **absent from every other page** (landing = 11 stylesheets, no CV chunk; after soft-nav = 14 incl. it). Hard-load = blocking `<link>` in head (no flash); the flash is soft client-nav ONLY — the playground (`cvb-*`) painting before the 79KB chunk finishes downloading. **The `loading.tsx` skeleton is inline-styled and was NEVER the source.** Fix = import the 4 CV stylesheets in `loading.tsx` so Next binds them to the loading boundary (build manifest confirms `/(authed)/cv/loading` went 0→4 css incl. the 79KB chunk) → downloads in parallel with page JS/RSC, ready before paint. One deduped chunk, ~1 RTT earlier, no CSS rewrite. (4) **Backend dedup/capacity — RECOMMENDATION (Shivam's scaling call, NOT built):** live prod metrics 6h = **CPU avg 0.2% / max 7.6%, mem avg 0.49GB** → near-idle. Rishabh's saturation was **blocked-slot / connection starvation** (sync Supabase reads parking on the anyio threadpool = low CPU + high latency), NOT compute. Ceiling = **1 uvicorn worker (no `--workers`) × Starlette default 40-token threadpool × 1 replica**, each sync read holding a slot up to 8s (`_POSTGREST_TIMEOUT_SECONDS`). Part 1 removed ~10 synchronized requests/login → far fewer concurrent blocked slots during a login burst. Residual risk = the `/companies/{name}` browsing-burst path (unchanged by #41 — it's browsing, not login) + bootstrap's internal 8-thread executor. **Cheapest highest-leverage lever given near-idle CPU: raise the anyio threadpool tokens (40→~100-200) + the postgrest/httpx pool** — matches the low-CPU/high-latency starvation signature; a 2nd replica mostly duplicates slots at higher infra cost when compute isn't the constraint. Making the hot sync reads async is the proper (bigger) fix. ⚠️ open uncertainty for Shivam: the **Supabase pooler connection limit** may be the true upstream ceiling — check before raising app-side pools. **OWED (Shivam):** (a) **prod = `main` merge** (all 3 commits; dev rides Develop); (b) **authed browser QA light+dark+375px** — the ONE thing not verifiable here (no test-account password; sandbox verified public surfaces render styled + soft-nav CSS mechanism + build manifest, not a real authed login's request waterfall): confirm login fires `/jobs/analytics` 0×, movers/chips appear on first scroll, score chip paints instantly + breathes while refreshing, and the CV playground has no unstyled flash on soft-nav over a throttled mobile connection; (c) the Part-4 capacity levers.

40. **Newsletter layout laws + acquisition-page density — CORE FIX BUILT + pushed Develop `95f737c9` (2026-07-20); `keyStats` backfilled `375d0c29` (2026-07-23). OWED: `main` merge · QA.** Trigger: Shivam — *"the newsletter is our acquisition page, shared on LinkedIn/Insta, and the spacing genuinely looks ugly."* Measured at ~2000px: the issue page rendered ~1/3 of its width as content, the rest as near-black void. **Three structural root causes, all fixed:** (a) issue page hardcoded `maxWidth: 1040` inside a 2000px viewport → ~480px dead void per side; both surfaces now `min(100%, 1280px)` (`.nl-shell` / `.shell`). Prose measure stays 68ch — the FRAME grew, not the text. (b) **Rail parity** — 300–340px reserved for a subscribe box + 3 links beside a 4000px article → the right third of the page permanently empty after first scroll. Now **ONE shared rail** (`frontend/components/newsletter/rail.tsx` + `rail.module.css`) rendered by BOTH index and issue: subscribe → live corpus proof → 6 issues → topic clusters → score CTA. **Dropped sticky** (it was a crutch for a thin rail; a sticky rail taller than the viewport hides its own bottom). (c) Article header (tag/headline/standfirst/byline) burned the above-fold budget before a single number appeared on a *data* newsletter → byline compressed to one line + optional `keyStats` frontmatter renders a stat strip under the standfirst. **Honesty invariants:** proof numbers read `/public/stats` floored through `frontend/lib/public-stats-display.ts` — extracted out of the `"use client"` `use-landing-data.ts` so a server component can import it, ONE source so landing + newsletter can never quote different numbers; panel **hides entirely** when the endpoint is unreachable (no placeholder counts on a page whose whole claim is real data). `keyStats` is **authored-only, never derived** from the body. **THE 5 LAWS** (full text `docs/NEWSLETTER_LAYOUT_LAWS.md` — ⚠️ `/docs` is GITIGNORED so that file is local-only on Shivam's Mac; canonical copy = memory `project_newsletter_layout_laws`): **L1** no band under ~30% ink (whitespace reads as paper on light, as a failed page on our near-black surface) — never hardcode a px container on these routes; **L2** a reserved rail must fill its main column or lose the column; **L3** prose stays 68ch (`--tm-reading-measure`) — widen the frame, not the text; wide tables/charts break out via `.nl-fullbleed` (most issues don't use it and should); **L4** data above the fold via `keyStats`; **L5** proof real or absent. **✅ `keyStats` BACKFILLED 2026-07-23 (pushed Develop `375d0c29`)** — all 16 issues now carry 3–4 verified figures lifted verbatim from each issue's own TL;DR/dataset (never derived); L4 pays site-wide. **OWED (Shivam):** (1) **prod = `main` merge** — himyro.com serves the old layout until then; (2) browser QA light+dark at 1920/1440/375px, incl. the now-live keyStats strip. **Deliberately NOT built — ✅ CONFIRMED DEFER 2026-07-24 (Shivam), no timeline set:** 3-column article layout at ≥1440px (`[meta 160px | sheet | rail 320px]`) giving `ReadingProgress` + share + section links a left-gutter home — adding a third column before the second one is full would be decoration, not density. Re-judge next time density is reviewed. Green: tsc 0 · eslint 0 · ui-drift clean · `next build` ✓. Memory: `project_newsletter_layout_laws`. Cross-link `project_newsletter_editorial_figure_system`, `project_newsletter_publish_pipeline` (the publish checklist should gain the L4 `keyStats` gate).

39. **Per-skill band percentile (density-gated) — LOGGED 2026-07-18 (grill-locked decision 3 of the banded-score redesign, NOT built — deferred at 296-user scale).** Trigger: the banded Myro Score redesign (backlog closed via `54d0825f`, memory `project_banded_myro_score`). Decision 3 locked a per-skill percentile: same-band, **density-gated (show only where the (band, skill) cell has ≥20 peers, else hide)**, honest tie semantics (share of band-peers at a **strictly lower** level). NOT built because at 296 users the (band, skill) cells are almost all <20 peers → every chip hides → zero visible value now, and a heavy cross-user aggregate read for nothing = speculative. **Scaffolding ready:** `backend/app/services/scoring/percentile.py` already has `percentile_rank` (strictly-below tie semantics) + `MIN_BAND_PEERS = 20`. **Build sketch when density arrives:** (a) repo aggregate — group `user_skills` by (skill_id, matched_level) joined to `user_profiles` band (`target_seniority_for_profile`), filter to the viewer's band, per skill compute peer count + share strictly below the viewer's level; (b) gate ≥20 peers → else omit; (c) endpoint (e.g. `GET /scores/skill-percentiles` or fold into the user-skills payload the forge/skills page reads); (d) frontend chip on the skill card, rendered ONLY when the API supplies a value (conditional, never an empty shell). Bound the aggregate (band-filtered SQL, not full-table scan) before shipping at scale. Cross-link `project_banded_myro_score`, [[feedback_no_cheap_models_judgment]] N/A (pure stat, no LLM). Trigger to pick up: a band grows past ~20 peers holding common skills (watch `user_skills` volume), or Shivam asks for it.

38. **Role-dedup judge — ✅ BUILT; ⚠️ two corrections 2026-09-12, and L1 is now dead.** The judge never once answered: a fixed 1200-token budget for up to 24 pairs starved every call, and `parse_judge` defaulted an unanswered pair to `different`, so 47 pairs were stamped `keep_separate` unruled and a decided pair is never re-judged. Budget now scales with the batch; silence records nothing; the 47 were cleared and re-judged (44 keep_separate, 2 proposed, 0 folds). **L1's "auto-fold HIGH (archive-only, restorable)" was never true** — `apply_fold` moves every story under the dup and archives the row with no record of what moved, so there is nothing to restore from. Auto-fold is off: a confident judge proposes, and only the user's ruling folds a role. OWED to re-earn it: give roles the receipt + undo `story_identity_fold` has for stories (ADR-0023). Evidence for the caution: the first run where the judge actually answered returned exactly one `high`, and it was wrong (a volunteer club folded into the degree it sat inside). **Original build notes:** Slice 1: `role_dedup.py` (candidate pairs = company family OR same-kind date-overlap, capped/converging; ONE batched judgment-lane call; high auto-folds archive-only via most-storied keep + deterministic date-union; maybe→proposed; different recorded — pair never re-judged) + `role_merge_verdicts` (own-only RLS, pair-normalized UNIQUE) + 11 tests. Slice 2: post-ingest pass in `_ingest_entry` (best-effort, never fails ingest) + lazy Stories-visit sweep (`maybe_enqueue_role_dedup`, >12 active roles, per-process debounce, `role_dedup` @handler on LANE_FAST — the retro path, no cron) + `ProfileView.merge_suggestions/tidied_roles` + `POST /cv/reservoir/roles/merge-verdict` (user ruling = law, merged applies fold via token client/RLS); career suites 142 passed. Slice 3: Stories-tab `MergeCard` ("Same role? A ↔ B" → Merge/Keep separate) + "Tidied N duplicate roles" 7-day receipt (no silent mutation); `cv.career.mergeVerdict` wire; tsc0/lint0/ui-drift/build✓. **OWED (Shivam): main merge (backend+worker+FE ride Develop) + authed QA on a fragmented account (cards render, Merge folds, receipt shows after a dump).** GRILL-LOCKED 2026-07-14 (`/grill-me`, 5 locks + one Shivam nuance). Full locks: memory `project_role_dedup_judge`. **L1** auto-fold HIGH (archive-only, restorable) · confirm MEDIUM via card · identity-suspect NEVER auto-ruled. **L2** post-ingest incremental (judge pass in `_persist_extraction`, ONE batched call per dump, worker) + lazy full-inventory sweep on Stories visit (>~12 active roles ∧ changed since last sweep — this IS the retro path); NO cron, dormant users cost zero. **L3** inline merge cards on Stories tab between the two containers ([Merge]/[Keep separate]; identity → [Mine]/[Not mine]); verdicts persist in new `role_merge_verdicts` — human ruling is LAW, judge never re-litigates. **L4** kept-row labels untouched (user's own words; deterministic date-union only; NO LLM-authored reservoir labels) — **projection-time exception: at CV tailoring the LLM MAY propose a JD-aligned role-label framing on the artifact (grounded, titles actually held, never written back)**. **L5** visible receipt ("Tidied N duplicate roles · review"), `get_judgment_provider()`, fail-soft = keep separate, pair-text must carry company+title+dates+top story titles (Lane A starved-judge lesson). Build: `role_dedup.py` mirroring `story_dedup.py` + `role_merge_verdicts` migration (manual-apply + reload) + Stories cards. Original context (why deterministic reconcile_role can't do this): The 2026-07-14 mit20 repair (69→31 roles) was a hand-run: strong-model judgment over the full role inventory + 4 user-fork questions. The product only has deterministic `reconcile_role` (ingest) + `repair_reservoir.py` (same matcher) — exactly what LEFT the fragments; it cannot see "I&D India Sales Manager" == "GTM BD Manager, GCC Growth" (zero title overlap, needs world knowledge + date reasoning). Every heavy dumper fragments the same way. **Build sketch (mirror `story_dedup.py`'s proven two-stage shape):** new `role_dedup.py` — deterministic pass (existing reconcile_role) → ambiguous candidate pairs (same normalized company family OR same/overlapping date window) → ONE batched **judgment-lane** judge call (`get_judgment_provider`, [[feedback_no_cheap_models_judgment]] — a 4B would confidently wrong-merge) returning merge pairs + confidence → auto-fold HIGH (same company + same period + title-synonym; archive-only, restorable) · MEDIUM → one-tap user confirm ("These look like the same role — merge?", the Mentor-walk one-Q pattern) · identity-ambiguous (foreign-vs-mine) NEVER auto-archived, always user-ruled (PV1/trust). Triggers: post-ingest after a dump lands roles + the profile-poll self-heal spot. `/grill-me` forks before build: auto-fold threshold vs confirm-everything · confirm UI surface (Stories tab banner vs walk step) · retro-run for existing users. Memory: `project_story_memory_jd_interview` (repair detail = the ground truth for judge prompts).

37. **Ranked job-skill importance (extension + matcher) — ✅ GRILL-LOCKED 2026-07-24 (Shivam, 3 forks). BLOCKED on sister-repo coordination, NOT yet buildable.** Trigger: extension "Track this job" popup screenshot — extracted skills render as flat PRIMARY/SECONDARY chip buckets; Shivam: *"rank the extracted skills by how important they are for the role — a better basis for deciding if a job is a good fit."* Current state (verified in code 2026-07-14): `backend/app/services/job_importer.py` splits binary primary/secondary via a deterministic required-zone term match (hardcoded confidence 0.82/0.68, [job_importer.py:113](backend/app/services/job_importer.py#L113)); scraped jobs carry only `job_skills.is_primary BOOLEAN` (canonical skill source, written by the `firecrawl_Supabase` scraper); the deterministic matcher flat-counts matched skills.

    **LOCKED (3 forks):** **(F1) Ordinal rank** — 1st/2nd/3rd most important skill per job, not a numeric weight or 3-tier bucket. **(F2) Whole matcher, not extension-only** — feeds `job_matcher` weighted overlap, playground Ready/gap ranking (which gap matters MOST for THIS job — dovetails with Lane C JD coverage, memory `project_story_memory_jd_interview`), heatmap, AND extension chips; interacts with #36 N3 brain-eval as the deterministic-layer signal underneath the holistic LLM rank, not a replacement for it. **(F3) Extraction runs on the judgment lane** (`get_judgment_provider`/tier-2c+, per `feedback_no_cheap_models_judgment` — importance-from-JD-language is a judgment call, not counting) — current deterministic primary/secondary split stays as fail-soft.

    **⚠️ ROLLOUT GATE (Shivam): do NOT ship until BOTH extension-imported AND scraped (firecrawl_Supabase) jobs carry `job_skills` ordinal rank — a two-tier corpus (some jobs ranked, most not) was explicitly rejected.** This makes the item **blocked on sister-repo work**, not agent-actionable alone. Next agent: (1) open the coordination conversation with the scraper side (what does firecrawl_Supabase need to emit ordinal rank per skill it already extracts); (2) only once that path is real, build in this repo: extraction emits ordinal rank from JD language (judgment lane) → `job_skills.rank` column + import-path equivalent (shared-Supabase migration, manual-apply + PostgREST reload) → wire the 4 consumers above.

36. **Event-driven matching + Career-Ops-brain-everywhere — GRILL-LOCKED 2026-07-09 (`/grill-me`, Kunal-Shah lens per fork), NOT built.** Trigger: Shivam — (1) kill "weekly scrape" (scrapes are continuous, by company·industry·location, driven by POWER USERS' targets but shared with ALL users); any user gets a **notification when a fresh scrape lands + their matches auto-update**; (2) **Career-Ops brain = the ONE standardized matcher**, rating as many cards as possible (experience-aware relevance + one standard). **Supersedes the weekly model:** `batch_week` as eval-freshness key DIES → eval identity permanent `(user_id, job_id)`. ⚠️ Corrected fact: `user_job_matches` is already DURABLE (upsert, no delete, evals cached+reused free via `on_demand`/`feed_warm`/`ranking`); the "new jobs" signal today is an in-app badge (pull-on-visit), NO push/email webhook exists; refresh already charges 150 coins only for vanity re-runs with no new jobs (`job_refresh/facade.py`). **Locked (N1–N5):** N1 in-app **bell + debounced digest** on **fresh matches** (any new, v1), ping carries the match, WhatsApp/email later. N2 auto-update on real new jobs = **FREE**, 150-coin only for vanity re-runs, user-pulled ADDITIONAL matching costs coins. N3 eager-rate **top 10–15 STRONG-gated** (never padded) + rest **on-open cached**, deterministic overlap = placeholder, **"want more" → IntentChat → coin expansion**, continuous loop. N4 **deterministic pre-filter → power/active priority → per-scrape cap** on RQ + Provider Budget (dev+prod share ONE Redis+budget → cap protects prod), compute-then-notify (never speculative). N5 **fold Agent Picks into the same brain pass** (auto-select strong top-N + grounded personalized "why" + tier → `user_agent_job_picks`, no-fab guard), human override = reserved power-user perk. **5 vertical slices, per-slice go, Slice 1 (de-weekly + scrape event pipeline) isolated first (mutates the live matching key):** (1) de-weekly + event pipeline → (2) `user_notifications` inbox/bell → (3) brain-everywhere read (audit all card surfaces read one `MatchEval`) → (4) Agent Picks auto-gen (fold N5) → (5) "want more" coin expansion. Overlaps in-flight jobops work + Agent Picks band (#already-built). Memory: `project_event_driven_matching_brain_everywhere`.

33. **⚠ SUPERSEDED AS THE CLOSER 2026-09-17 (ENG1).** The last consumer CTA is now ₹199/month Personalised Engagement — [OFFERING.md](OFFERING.md). The locks below are history of the ₹99 one-shot (built, never the live closer). Remaining work is item 7 above: subscription checkout, scene-as-surface, LinkedIn Services × Myro as one queue. Do not ship a ₹99 offer card.

    **Offering + landing funnel realignment — job-gen + ₹99 Job-Switch Plan (GRILL-LOCKED + BUILT 2026-06-27, on Develop + dev).** Triggered by a Perplexity landing critique ("message compression" — himyro.com tries to say CV-optimizer + matcher + intelligence + colleges + newsletter + Myrology at once → cold visitor can't name the product) + Shivam's two new threads (prompt-driven job-gen, ₹99 services tier). Two `/grill-me` passes (offering 8 Qs + ₹99 deliverable 6 Qs) resolved into ONE coherent job-seeker funnel. Full locks + honesty boundary: memory `project_offering_funnel_jobswitch_plan`.

    **BUILT (Develop, deployed dev backend, migration applied to shared Supabase):** (1) landing reorder to locked skeleton + Myrology/Surfaces demoted + "Made with ❤️ in India" footer (`f0d2bb5`); (2) job-gen `POST /public/job-search` (NL parse → real `feed_jobs`, closest-rec relax, never fabricated) — smoke-verified live on dev; NOTE the landing job-gen FRONTEND was later reworked externally to route to `/intel` via `JobSearchConsole` (the `/public/job-search` endpoint stays valid/deployed); (3) ₹99 Personalised Job-Switch Plan (`64700ee`): `job_switch_plans`+`_reviews` tables, `job_switch_plan_service` (living plan + 2 founder reviews/120d, review-1 auto + review-2 on-demand, 5-wd SLA), `job_switch_plan` entitlement product + key-dispatched fulfilment, `/job-switch-plan` router + authed surface. backend 41 passed, tsc 0, lint 0.

    **REMAINING (read item 7, not this list, for the closer):** (a) prod Razorpay for any real charge; (b) the ₹99 offer-card mounts are **not** the next build — do not ship them; (c) reviewer email + `job_switch_admin_token` still required or delivery 503s; (d) ~~₹499/yr~~ retired 2026-09-17, closer is ₹199/month; (e) browser QA the authed plan surface with a real session.

    **Product in one line (updated 2026-09-17):** Drop CV → live Myro Score → type the job you want → see real matches + your exact gap → last CTA is ₹199/month **Personalised Engagement** on that scene. LinkedIn Services Resume Writing is the other door into the same queue.

    **Locked:** (Q1) Spine = CV scored + tailored vs LIVE demand, outcome-worded not platform-soup. (Q2) **Job-gen returns REAL openings ONLY** — NL prompt → LLM parses to structured filters → reuse EXISTING `feed_jobs`/matcher, never fabricated; thinnest durable pipeline, render on existing card. (Q3) Job-gen = landing SECONDARY proof-search (CV dropzone stays hero), gates apply/save to signup, doubles as interactive moat proof. (Q4) ₹99 = skill-mastery coaching to switch-READINESS, NOT placement brokerage. (Q5) ₹99 = automated plan + ONE bounded human checkpoint, one-time INTRO (cash=human, coins=automated per locked boundary). (Q6) Offer trigger = job-gen gap (headline) + score skill-gap (everyday). (Q7) Landing = Hero(CV→score) → job-gen proof → how-it-works(built) → 10-domain chips(built) → ₹99 bridge TEASER → trust/FAQ(built); **Myrology FULLY OFF landing, Coins OFF as a cold-visitor concept, Colleges/Newsletter = nav only.** (Q8) Name = "Personalised Job-Switch Plan" (plain noun = user agency to choose). India: keep "Built in India" tile + add "Made with ❤️ in India" footer.

    **⚠️ Honesty boundary (copy discipline, tightened 2026-09-17):** guidance is ours, conversion is theirs. We do not sell the job, so we do not sell a finish line. Name said "Switch"; promise = switch-**ready**. NEVER guaranteed placement. The ₹199/month closer exists because they may not convert — they keep the scene, we do not owe them the offer. Don't drift into placement-brokerage. Full lock: [OFFERING.md](OFFERING.md) ENG1.

    **LAUNCH GRILL — locked 2026-07-01 (Shivam, `/grill-me`).** The "₹99 deliverable mechanics" carry was STALE — those mechanics were already grill-locked + BUILT 2026-06-27 (verified in code: `job_switch_plan_service.py` + `routers/job_switch_plan.py` live). This grill locked the LAUNCH shape instead: **L1** reviews = LLM-drafted → founder edits+approves DAY 1 (overrides B3 "LLM-assist=future"; build = draft generator → approve-queue → deliver+email); **L2** offer trigger = persistent home-rail card, gap-personalised (real top gap, not generic); **L3** mobile = same card inline in dashboard feed (rail hidden ≤980px); **L4** value LEADS with the human review (auto plan = scaffold); **L5** locked copy verbatim: "A Myro reviewer personally reads, checks and helps build a personalised plan for your job switch"; **L6** go-live = FULL OPEN + Claude builds a kill-switch env flag. **Unblocks owed by Shivam:** (i) reviewer email → `job_switch_reviewer_email` + `job_switch_admin_token` (else review delivery 503s); (ii) `main` merge + confirm Vercel prod `NEXT_PUBLIC_RAZORPAY_KEY_ID` = live `rzp_live_…` matching backend (pair-lockstep, #17); (iii) confirm refund = full refund before a review approved/delivered, non-refundable after. **Build owed by Claude (this is the remaining #33 work):** offer card (2 mounts) + LLM review-draft→approve-queue→deliver + kill-switch + L5 copy. Memory: `project_offering_funnel_jobswitch_plan` (LAUNCH GRILL section).
    **Unresolved (carry):** (1) ✅ **SUPERSEDED 2026-09-17 (Shivam, ENG1).** The parked ₹499/yr tier is retired. The closer is ₹199/month Personalised Engagement ([OFFERING.md](OFFERING.md)), not a one-shot intro waiting on an offer card. (2) ✅ **BUILT + pushed Develop 2026-07-24.** job-gen thin-market/no-match → show CLOSEST real recommendation, real openings never fabricated. **Discovery mid-build: the backend closest-rec logic (`public_job_query` location-relax + `relaxed: []` field) was ALREADY built + tested (`test_public_job_search.py`, 4/4 green) — but orphaned, since the landing job-gen box was reworked to route to `/intel`'s live search (`useGlobalJobSearch`, a plain trigram lookup with no fallback).** Fix: new `lib/hooks/use-job-gen-fallback.ts` calls the existing `/public/job-search` endpoint ONLY when the fast trigram search settles on zero hits (never per-keystroke — that endpoint is anon-rate-limited 12/hr) and surfaces a "No exact matches. Closest real openings (nearest location)" panel in `intel-results.tsx`. No backend change needed — reused the existing, already-tested logic instead of duplicating it. tsc 0/eslint 0/ui-drift clean/next build ✓. OWED (Shivam): browser QA on `/intel` — search a role+city combo with zero real openings, confirm closest-match cards appear with the location-relaxed note.

32. **Design-system standardization + button cascade — IN PROGRESS (2026-06-21/22, all on Develop, pushed).** Trigger: Shivam — *"one website / consistency = trust"*; caught the nav rendering as two parallel CSS systems + a logged-in user seeing an anonymous CTA. Principle: standardize the shared concept via a **single source both consumers read**, enforced by a build gate, never by discipline. Full system + file map in memory `project_truyodha_standardization_system`.

    **✅ DONE (pushed):**
    - **Nav unified** — the public bar's authed tabs now render the canonical `.tm-topbar-link*` + `.tm-nav-content-cluster` classes from `globals.css` (one source, no parallel CSS): same 13px, boxed active tab, order + labels as the app shell.
    - **`lib/format.ts`** — single date/number/relative formatter (en-IN dates, en-US counts, named presets). All 23 inline `toLocaleDateString`/`toLocaleString` sites migrated; drift floor locked at 0.
    - **`components/ui/badge.tsx`** — rewritten to `--tm-*` token variants (default/neutral/soft/success/warning/outline); genuine count/status badges migrated (nav "9+", settings count + NEW).
    - **`components/ui/button.tsx`** — kit completed: added `neutral` (grey/secondary) + `danger` (token-based, kills hardcoded `rgba(255,80,80)`). Now `solid · outline · neutral · danger · ghost · inline`.
    - **`CompanyLink` everywhere** — Intel company rows (`intel-rows.tsx` CompanyRow + CompanyHiringRow) now render crawlable `<a href="/companies/{name}">` (SEO/AEO + the locked "company name is ALWAYS a link" rule). Company page (`/companies/[slug]`) gained `layout.tsx` (PublicTopNav) + auth-gated the anon score CTA.
    - **SSR `/companies` directory** (`app/companies/page.tsx`, server-rendered crawlable links, ISR hourly) + **`sitemap.ts`** now emits every company page (were absent entirely).
    - **`lib/site-routes.ts`** — single route registry; nav + footer + sitemap all DERIVE from it. Add a public page once → flows everywhere.
    - **Door-check** — `scripts/ui-drift-guard.mjs` (npm `check:ui-drift`, wired into `.github/workflows/frontend-ci.yml`): ratchets hand-rolled patterns (jsHoverStyleMutation, handRolledModalScrim, handRolledPill, rawDateNumberFormat→0) — new drift fails the build, backlog only ratchets DOWN via `-- --update-baseline`; plus `publicRouteCoverage` (a public `app/<seg>/page.tsx` with no registry entry fails the build).
    - **Buttons migrated so far:** companies-page CTAs · web-chrome sign-out dialog · ReviewModal · ManualAddModal · MyrologyOptInPrompt.

    **REMAINING — REFRAMED 2026-06-22 (the "~80 inline-button files" was inflated; genuine ad-hoc inline drift is mostly already done).** The big remaining "button" surfaces are NOT ad-hoc drift — they're **two cohesive local button kits, already internally consistent:**
    - **`cvb-btn`** (CV builder — `public-playground` 14, `playground-view` 11, `baseline-view` 7, `cv-export-view`): one `.cvb-btn primary/ghost` class family.
    - **`up-*`** (upskilling — `quiz-runner`, `results` 27): one `.up-opt`/`.up-iconbtn`/… family.

    Two tracks left, each a decision (not a blind sweep):
    1. ✅ **DONE 2026-06-22.** Genuine inline stragglers cleared. On inspection there was just one clean stateless inline CTA left — settings-modal "Open feedback hub" → `<Button solid>` (`1f11aba`). Deliberately LEFT: settings Save/Buy (turn green on success = intentional state feedback, not drift), listbox options + category cards (selectors), and the builder-view buttons (all `cvb-*` kit → Track 2, never inline drift). Net: the genuine ad-hoc inline-button drift is now cleared — what a user *sees* is consistent.
    2. ✅ **BUILT + pushed Develop 2026-07-24** (`5bbde73d` up-* phase + `cebff4e1` cvb-btn phase). All `up-btn`/`up-iconbtn`/`cvb-btn` instances (~93 buttons across 25 files — CV Playground, master workspace, public anon playground, upskilling quiz/results, gap-session/bullet-rewrite/restructure Mentor flows) now render canonical `<Button variant/size>`; both kits' page-local CSS deleted. `up-opt` (quiz answer selector) and `tm-lib-btn`/`csp-done-download` (other local kits, out of scope) untouched. `DownloadCVButton` gained opt-in `variant`/`size` props — only its `cvb-btn` caller switched. Two dead container classes (`cvb-action-group`, `cvb-intel-strip`) found + their orphaned hook rules removed. tsc 0 · eslint 0 · ui-drift clean (rawFontSizeLiteral 1618→1614) · next build ✓. **OWED (Shivam): browser QA CV Playground + upskilling quiz/results, light+dark+375px — no live browser in this session; prod = main merge.**

    **Always LEAVE:** selectors/chips (filter pills, stage chips, severity selectors, star ratings) — a separate future "chip" standardization — and **intentionally-different** buttons (`new-report.tsx` submit is category-colored bug=red/praise=green, not drift). The `ui-drift-guard` keeps NEW inline drift out regardless. Memory: `project_truyodha_standardization_system`, `feedback_standardization_trust`.

27. **Regenerate landing OG image → Engine diagram (LOGGED 2026-06-11, not started).** `app/opengraph-image.tsx` still renders the old CV-hub framing ("one hub for every CV version"). Handoff requires the OG to show the **Engine pipeline diagram + Myro Score badge** with the new claim "Myro — The Career Intelligence Platform" (metadata + JSON-LD already updated in `app/page.tsx`). Mirror the S2 pipeline visual: stage nodes + teal flow lines on `#0a0a0c`, Space Grotesk. Quick win, ship with or after the landing commit.

18. **Dashboard `/home` loading redesign (GRILL LOCKED 2026-06-01, NOT built):** Triggered by shivam.mit20 screenshot — generic "Loading your dashboard…" + a LYING "FIRST CV IN 10 min" first-run pill shown to a veteran (firstRun defaults TRUE while `cv.versions` undefined). 14 decisions locked in `memory/project_dashboard_loading_redesign.md`. Model = **section-readiness** (not phases — `/home` is parallel client queries, not a server job). Two PRs: **PR1** = correctness — kill global `blocking` gate (`home/page.tsx:187`), `SectionGate` composition, co-located real-shape skeletons (reuse real `mc-hero`/`db-row` classes; delete orphaned `HomeSkeleton` mirroring pre-merge layout), per-section 6s tail copy, **pill-bug fix** (`isFirstRun(undefined)` → not-first-run + `.tm-cv-promise` gap CSS), delete floating `top:76` text. **PR2** = the "no-shimmer" cursor/touch-reactive **teal-edges playground** — extend `EdgeGlow` into a shared `<TealField mode=full-bleed|masked>` primitive; field-fill behind real-shape teal-edged cards that crossfade per-section; ambient-never-blocking, compositor-only + hard-teardown-on-ready, no gyro on mobile. Needs one "loading model" ADR (after ADR-0009). Sibling of the CV-upload loading redesign (`project_cv_loading_redesign`).

   **PR2 DECISION 2026-06-13 — DEFERRED (do NOT build now). Shivam's rule: don't trade real speed for decoration.** PR1 (section-readiness skeletons) is shipped and IS the loading state. With #24b deployed + #21 bootstrap parallelized, the post-login load is ~1.5s — there's no longer a multi-second dead gap worth decorating. PR2 is an ambient teal-motion layer that would mount **during** the most latency-sensitive moment (initial paint) and compete for main-thread/GPU exactly when we're trying to paint fast — the precise "vanity over speed" trade Shivam vetoed. Build PR2 ONLY if a future profile proves (a) a genuine >2s unavoidable wait remains on some surface AND (b) the field is provably compositor-only (transform/opacity, `will-change`, zero layout/paint on the main thread) with hard-teardown-on-ready measured in DevTools (no frame drop on the real cards). Until both hold, the skeleton stands alone. The `<TealField>` primitive already exists (callback uses it) — no infra debt from waiting.

19. **B2B Institutions lane — STEP 1 SHIPPED 2026-06-01, growth steps DEFERRED.** Beta-phase decision: ship only the demand-sensing front door, not the platform. **Done this session (pushed to `main`):** (a) `/institutions` canonical marketing route — reuses `<EnterpriseSignup initialMode="institutions">`, indexable, OG, `/signup/institutions` canonical→`/institutions` to dedupe; (b) **header entry** "For Colleges" (`GraduationCap`) in `components/public/top-nav.tsx` + footer "For Colleges" under Product; (c) **CRM hook — ✅ VERIFIED LIVE IN PROD 2026-06-23.** `POST /institutions/apply` schedules a best-effort email to `settings.institutions_lead_email` via `BackgroundTasks` (mirrors Myrology booking-notify; fail-soft, row persisted first). Env `INSTITUTIONS_LEAD_EMAIL` set in Railway. **End-to-end confirmed:** a beta tester submitted via `/institutions` → row `institution_applications` id=1 → notify email landed in Shivam's inbox. Form→DB→email chain + the env are all live (no longer persist-only/silent). The `institution_applications` table + the rich beta-access form already existed. **Re-skin to light also shipped this session:** `/signup/institutions` forced `data-surface=light` on mount + `--tm-radius-md` defined (cards were rendering 0-radius) + `--es-shadow-sm` retuned off dark `rgba(0,0,0,0.4)`. **DEFERRED until we decide to grow B2B (do NOT build until real applications arrive):** Step 2 = proper CRM/pipeline (HubSpot/Salesforce or a lightweight internal review queue UI over `institution_applications`, Slack alert, status workflow). Step 3 = multi-tenant platform — each college = org/tenant, placement-officer admin console, students as sub-users, SSO/SAML (Workspace/365/IdP), domain verification, bulk/CSV student import, cohort dashboards + placement analytics (the 6 capability cards are promises, not built). Also deferred: dedicated long-form `/for-colleges` marketing page with case studies/ROI (today `/institutions` = the rich signup pane doubling as landing), procurement collateral (security doc, DPA, MSA), pricing. Trigger to pick up: inbound beta applications show real business signal. Reverses ADR-0005 "not a B2B sales tool" NOT. Memory: `project_b2b_institutions_lane`.

20. **Enterprise Polish Sprint — Mobile UX + Core Bug Fixes (PLANNED 2026-06-02, ready to code)** — Triggered by deep audit of `reference/` folder: 100+ screenshots, 20+ user feedback docs, and 6 pre-written `reference/mobile-redesign/*/HANDOFF.md` specs. Goal: make Myro feel like an enterprise-grade B2C product. **Everything below is code-ready — no more grilling needed. Claude Code picks up and executes in order.**

   **Overarching theme from 20+ beta users:**
   - "Don't know what to do first" — no onboarding flow
   - "Feels robotic / AI-generated" — harsh contrast, technical jargon
   - "Confusing on mobile" — 6 specific layout bugs all with HANDOFF docs
   - "Blank or broken states" — Tracker empty state, Intel empty state feel abandoned
   - "What does this platform actually do?" — identity confusion on first visit

   ---

   ### PR-K — Design Token Foundation (LAND FIRST — all other PRs depend on this)
   **Spec:** `reference/mobile-redesign/k-tokens/HANDOFF.md` (complete, self-contained)
   **Files:** `frontend/app/globals.css`, `frontend/tailwind.config.ts`, `frontend/app/cv/cv-builder.css`, `frontend/components/public/public-nav.css`, `frontend/components/public/intel-pane.css`, `frontend/components/skills/domain-accordion-row.css`, `frontend/components/forge/forge-xp-pill.css`
   **What changes:**
   - Page bg `#000` → `--bg-page: #0a0a0c` (near-black, not void)
   - Cards get `--bg-surface: #13141a` (visibly above page — layered depth)
   - Primary text `#fff` → `--text-primary: #e8e8ea` (off-white, eye-safe)
   - Cyan text `#22d3ee` → `--accent-text: #67e8f9` (desaturated when used as text, full saturation for icons/buttons only)
   - Body min-size floor: `16px / 1.55 line-height` everywhere
   - Full token table in HANDOFF. No hex literals in any new/updated CSS.
   **Acceptance:** WCAG AAA primary text vs bg-page. Cards have visual lift without border. Reading a skill card paragraph feels comfortable at arm's length.

   ---

   ### PR-B — Signup Simplification (depends on PR-K)
   **Spec:** `reference/mobile-redesign/b-signup/HANDOFF.md` (complete)
   **Files:** `frontend/app/signup/page.tsx`, `frontend/components/onboarding/NinjaNameStep.tsx`
   **What changes:**
   - REMOVE "SECRET NINJA USER_CODE" field from `/signup` entirely. Real user typed `"dont know it should not be here"` into it — smoking-gun evidence it breaks conversion.
   - REMOVE the "BACKGROUND" light/dark theme toggle from the signup form.
   - Signup = 2 fields only: Email + Password. Plus Google button below "or" divider.
   - Ninja name moves to `NinjaNameStep` in onboarding (already exists per commit `aa7a879`) with auto-generated default (`silent-fox-9k2` pattern) + Skip option.
   - Referral attribution: if `?ref=` present, show subtle 1-line "Invited by @{name}" above form (SH7).
   - Backend: `ninja_name` field in signup payload becomes optional — server auto-generates if absent. Verify `suggest_ninja_name` endpoint (`backend/app/routers/profile/public.py`) handles this.
   - Mirror styling fixes to `/login` for consistency.
   **Acceptance:** 2-field form, no ninja field, no theme toggle, NinjaNameStep has pre-filled default + Skip, input height ≥44px, input font ≥16px (no iOS auto-zoom).

   ---

   ### PR-E — Skills Overview Mobile Header (depends on PR-K)
   **Spec:** `reference/mobile-redesign/e-skills-overview/HANDOFF.md` (complete)
   **Files:** `frontend/app/skills/page.tsx`, `frontend/components/skills/` (score-ring, stat-line), NEW `frontend/components/skills/skills-overview.css`
   **What changes:**
   - KILL the horizontal stat-line `8 domains · 21 skills · 0 need proof · 3 below 40%` that wraps one-word-per-line on mobile (confirmed bug in screenshot, named in 2026-05-21 CLAUDE.md QA).
   - REPLACE with 2×2 stat tile grid on mobile / 1×4 row on tablet+. Each tile: uppercase label (11px, tertiary) + big number (tabular-nums, primary) + thin divider. Pattern = Stripe Dashboard mobile Home. Tap → filtered skill list (`?filter=below-40` etc).
   - Score ring becomes the visual anchor — increase to ≥120px diameter, explicitly stack ABOVE the stat tiles.
   - Score commentary ("Building foundation · Next milestone: 20 — Emerging") sits below the ring.
   - Tab bar (Intel / Map / Audit) stays BELOW the header — never overlapping.
   - Empty state for 0-skills users: calm prompt to upload CV, not "0 domains · 0 skills…"
   **Acceptance:** No single-word-per-line wrapping anywhere. 4 stat tiles tap-targetable. Ring ≥120px. All elements above fold or barely scrolling on 375px.

   ---

   ### PR-G — Intel Heatmap Mobile Layout (depends on PR-K)
   **Spec:** `reference/mobile-redesign/g-intel-heatmap/HANDOFF.md` (complete)
   **Files:** `frontend/app/intel/page.tsx` or `frontend/components/intel/` heatmap component
   **Status:** CLOSED for the Codex-assigned PR-5 heatmap slice by `3daff43 fix(ui)`.
   **What changes:**
   - Title "Where to invest your skill points" wraps one-word-per-line on mobile (same grid-shrink bug as skills). Fix: title stacks ABOVE the heatmap on mobile, not beside it.
   - Rotated column headers (skill names) clip text at 375px. Fix: horizontal-scroll heatmap with non-rotated short labels on mobile OR collapse to list view.
   - Empty cells showing "no roles match" prose → replace with em-dash `—` in cell (tap for explainer).
   - Sticky header offset on first row (company name hidden behind search bar shadow).
   **Acceptance:** Title readable on 375px. Column headers legible. Heatmap scrolls horizontally, nothing clips.

   ---

   ### PR-D — CV Playground Score Ring (depends on PR-K)
   **Spec:** `reference/mobile-redesign/d-cv-playground/HANDOFF.md` (complete)
   **Files:** `frontend/components/cv/builder/playground-view.tsx` + score ring component
   **Status:** CLOSED for the Codex-assigned PR-5 playground slice by `3daff43 fix(ui)`.
   **What changes:**
   - D1: Score ring center text overlap — `0`, `%`, and `JD MATCH` literally layer on top of each other. Fix: explicit vertical layout — numeral row → `%` baseline-aligned right → "JD MATCH" label as separate row BELOW the ring (not inside center).
   - D2: "−17 this session" punitive framing → replace with action-oriented copy ("13 skills to add → Forge them") OR drop the negative delta. The chip list below IS the action already.
   - D3: Job label is generic ("Sciences - Consultant") with no company name — show "Untitled company" explicitly if no company in data.
   - D4: Title-case chip text (`Time Series Analysis And Forecasting`) → lowercase "and" inside chips.
   **Acceptance:** Score ring center has clean 3-row layout. No text overlap at any score value 0-100. No punitive framing.

   ---

   ### PR-F — Skill Card Mobile (depends on PR-K + PR-E for tab bar fix)
   **Spec:** `reference/mobile-redesign/f-skill-card/HANDOFF.md` (complete)
   **Files:** `frontend/components/skills/skill-card-inline.tsx` + CSS
   **What changes:**
   - F1: Sticky "Intel · Map · Audit" tab pill overlaps domain card below it (L3 chip half-hidden). Fix: sticky pill needs solid `--bg-page` background + `box-shadow` to visually detach. OR convert to in-flow element if sticky isn't actually needed.
   - F2+F3: SE14 regression — mobile buttons show full labels ("Edit CV pointer", "Polish with AI · -20 XP") instead of icons-only at <480px. Fix: add/verify `.tm-skill-card-action-label { display: none }` at <480px. Buttons collapse from 3 full-width stacked (~180px) to one icon row (~48px).
   **Acceptance:** Tab pill never overlaps cards at any scroll position. At <480px exactly 3 icon buttons in a row with aria-label + title. SE14 enforced.

   ---

   ### PR-JARGON — Language Humanisation (standalone, no deps)
   **Status:** Codex-assigned feedback jargon slice CLOSED by `3daff43 fix(ui)`; keep the broader checklist below as historical audit context.
   **No HANDOFF doc** — but 15+ users explicitly called this out. Confirmed list of confusing strings:
   - "Forge" → keep the name (brand) but ADD a 1-line descriptor: "Forge · skill practice sessions" in the nav tooltip/label
   - "Immutable commits" → "CV versions"
   - "Terse, be specific" (Feedback Hub) → "Keep it short and clear"
   - "Email me when triaged" → "Notify me when reviewed"
   - "Low cosmetic" (severity) → "Minor visual issue"
   - "AT RISK" domain pill → add hover tooltip: "This domain has skills below 40% — needs practice"
   - "BUILDING" domain pill → add hover tooltip with what building means (L1-L2 range)
   - "Dispatch" anywhere user-visible → plain English equivalent
   - Feedback form bottom-left: verify it's actually functional (user Ravali + user Aditya both reported broken)
   **Files:** `components/nav/`, feedback hub component, domain pill component, anywhere these strings appear.

   ---

   ### PR-EMPTY — Empty State Designs (standalone)
   **Cross-cutting — multiple users reported Tracker + Intel feeling "broken" when empty**
   - **Tracker empty state:** Replace multiple `+ Add manually` buttons with single focused CTA → "Browse matched jobs →" (routes to /market feed). Remove duplicate affordances.
   - **Intel heatmap empty state (no followed companies):** Current state unclear. Add single illustration + "Star a company to track its skill demand" + "Browse companies →" CTA. Per IH1 (heatmap = followed companies only).
   - **Dashboard stats loading:** Section-readiness skeletons (Backlog #18 PR1) — connect to this sprint if not yet built.
   - **Jobs feed empty state (no matches yet):** "Your matches are computing — usually under 2 minutes" with shimmer skeleton rows, not a blank page.
   **Files:** `frontend/components/tracker/`, `frontend/components/intel/heatmap.tsx`, `frontend/app/home/page.tsx`

   ---

   ### PR-FORGE-BG — Forge Timer Background Persistence (standalone)
   **Status:** CLOSED by Codex in `4b28856 fix(forge)`.
   **Bug:** Forge timer stops/freezes when user navigates away from the Forge tab (user Ravali, user feedback report 2). 25-minute sessions that reset on tab switch are unusable.
   **Fix direction:** Store forge session `startedAt` + `pausedAt` in localStorage (or Zustand persist). On any page mount, check if an active forge session exists → re-derive elapsed time from `Date.now() - startedAt - pausedMs`. The timer widget should render on any authed page while a session is running (the forge XP pill / widget is already a global element — verify it consumes persisted time).
   **Files:** `frontend/components/forge/forge-xp-pill.tsx` + forge session state store. Backend `forge_sessions` is already the source of truth for completed sessions — this is a frontend-only time-display fix.
   **Acceptance:** Start a forge session on /forge, navigate to /cv, navigate back — timer shows correct elapsed time throughout. Tab-close + reopen within session window = timer continues from correct position.

   ---

   **Build order:** PR-K → (PR-B, PR-E, PR-G, PR-D, PR-F in parallel, all depend only on K) → PR-JARGON, PR-EMPTY, PR-FORGE-BG (all standalone, can ship any time after K).
   **Codex closure note 2026-06-03:** PR-G/PR-D Codex slices, PR-FORGE-BG, and the feedback-jargon slice are closed. PR-EMPTY remains Claude-owned.
   **Commit pattern:** one PR per item, `fix:` or `feat:` prefix, `tsc --noEmit` + `next lint` clean before merge.
   Memory file: `memory/project_enterprise_polish_sprint.md` (create on session start).

10. **Skill Intelligence Page — Redesign (in progress)** — Full audit done 2026-05-16. Phased plan below.

15. **Job Card Lifecycle Loop (idea, parked 2026-05-27):** Netflix-style lifecycle model for every job card — track `posted_at`, `first_seen_on_platform_at`, `last_seen_on_platform_at`, `delisted_at`. Pair the job-side lifecycle with a user-side application-stage loop: once a user saves/applies, prompt + track stage transitions (saved → applied → screening → recruiter call → interview → final round → offer/reject) and the dwell time in each stage. Aggregate cross-user signal per company/role: median time-to-first-reply, median screening→interview gap, ghosting rate, offer rate, typical funnel shape. Surface back to users as "what to expect from this company" + sharpen our own match ranking + power a future newsletter/intel surface. Pick up when we redesign the job card to make the experience better — this loop is the data engine that justifies the new card layout. Touches: `jobs` schema (lifecycle timestamps), `job_applications` (already has `status` + `last_stage_changed_at` per Q7), new `application_stage_events` event log, a nudge/reminder cadence for stage updates, and an aggregation RPC for company funnel stats.

17. **Legal hardening for 10k scale (DOCS DONE 2026-06-02, counsel sign-off open):** Entity now = **Myro Career Intelligence Private Limited** (renamed across terms/privacy). Payment T&C shipped on both money surfaces (XP billing modal + Myrology checkout carry Terms+Privacy consent line). Terms §07 **Payments, XP & Refunds** (XP = closed-loop credit, not RBI PPI; funds servers not jobs; Myro = distributor of company listings; **Cancellation & Refunds** — XP final, Myrology full-refund-before-delivery / non-refundable-after). India-compliance pass INTEGRATED via Legal Compliance Checker agent: **DPDP consent microcopy at signup** (`signup-form.tsx`), privacy §06 rights expanded (withdraw/nominate/erase), §03 purpose-limitation, §04 cross-border-transfer, §07 cookie-banner-not-required note, NEW privacy §11 **Grievance Redressal** (24h ack / 15-day SLA, IT Rules 2021), terms §08 operator/grievance disclosure, §10 fraud/gross-negligence carve-out, footer "Cancellation & Refunds"→/terms#payments (Razorpay live-key prereq). Razorpay is **LIVE** — prod backend (`mirror-backend-prod`) env `RAZORPAY_KEY_ID=rzp_live_SuJDCjSGSSkGAP` + secret, tested by Shivam 2026-06-03. Billing badge is key-derived → auto-shows "Secure checkout" (no test-mode warning) on prod. ⚠️ **Verify the matching frontend public key:** Vercel **production** env `NEXT_PUBLIC_RAZORPAY_KEY_ID` must = `rzp_live_…` (same pair as backend) or checkout signature mismatches. Dev backend has no Razorpay key (payments untestable on pre-prod unless test keys added). tsc/lint clean, pushed to `main`. Files: `frontend/app/terms/page.tsx`, `frontend/app/privacy/page.tsx` (+ `privacy-components.tsx`), `frontend/components/settings-modal.tsx`, `frontend/app/myrology/checkout.tsx` (+ `myrology.css`), `frontend/components/auth/signup-form.tsx`, `frontend/components/public/public-footer.tsx`. Memory: `project_payment_legal_terms`. **OPEN — NEEDS SHIVAM + COUNSEL (placeholders live in code, NOT autonomous):** (a) lawyer review of both docs; (b) **CIN number** → `[to be inserted]` in terms §08; (c) **named Grievance Officer** — section shows designation+`grievance@himyro.com` only, IT Rules want a named individual; confirm the `grievance@himyro.com` mailbox exists + is monitored (24h/15-day SLA is now a public commitment); (d) full registered office address (street+PIN, MCA record); (e) confirm Myro is **not** a Significant Data Fiduciary (so no statutory DPO; "Grievance Officer" label correct); (f) sign off INR 5,000 liability cap; (g) confirm Myrology refund mechanics match booking flow + final price (₹499 vs ₹200-300 intro); (h) EU/UK in-scope check (cookie note assumes auth-only cookies). Razorpay live-key activation needs Terms+Privacy+Refund pages visibly linked (done).

---

## CV WORKSTATION — GOLD-STANDARD GAP (opened 2026-09-18)

> Found by building one CV end-to-end for a real JD (Amazon Sr. PM, RoW ATS Tech,
> `ext_c59b57e74ff07bffb713`) against Shivam's own account `33b66361-…`, v111 → v116.
> Every line below was verified in code or in `cv_versions` during that build.
> The target these describe: a one-page CV where **every bullet leads with a
> quantified outcome**, structured for the role, verified to fit. The build reached
> 18 bullets, 18/18 quantified — and **not one step of it was reachable from the UI.**

47. **⚠️ MEASURED 2026-09-18 — the master-rewrite path destroys any CV section the schema cannot hold. 5 users damaged, root cause is #48.**

    **The mechanism is a lossy round trip, NOT a model deleting things.** `backend/app/routers/cv/skill_edit.py:440` does `new_body_text = cv_skill_edit.render_baseline_text(new_structured)`, which is `cv_compose.render_deterministic` — it renders **only** the six keys in `CVStructured`. Any heading with no structured home cannot survive, and the regenerated text **overwrites the master's `body_text`**. That is why the damaged masters keep every role (roles have a field) while the body shrinks ~30%.

    **This makes #47 and #48 one item, not two.** No write-side contract fixes this while the schema has nowhere to put LEADERSHIP ROLES, RECOGNITIONS & ACHIEVEMENTS, CORE COMPETENCIES or PERSONAL DETAILS. Fix the schema first, or make the renderer preserve unknown sections verbatim.

    **Measured reach** (all 410 uploaders scanned, method in this entry — re-run before trusting it):
    - Rewrite path total: **77 versions, 6 users**, 2026-05-22 → **last run 2026-08-05**. It has not fired in six weeks. Still live in code.
    - **Section loss: 5 users.** Of 338 users with a comparable first-vs-current master, 24 lost a heading; 19 of those were the user's own re-upload (their choice, not damage). The 5 rewrite-path cases lost, among others: `PROFESSIONAL EXPERIENCE` (two users), `AWARDS & ACTIVITIES`, `CERTIFICATIONS & ACHIEVEMENTS`, `LEADERSHIP ROLES`, `RECOGNITIONS & ACHIEVEMENTS`, `PERSONAL DETAILS`.
    - **Model reasoning persisted as CV content: 1 user** (`33b66361-…`), 7 versions, 3 of them masters. id 454 (v96, `baseline_upload`) holds *"We need to maybe improve: … Avoid adding unverified info … Safer:"* in `body_text`. Every other candidate across 410 users was a false positive — "Large Language Models" listed as a skill.
    - **Fabricated role: observed once, NOT reliably measurable.** id 459 (v99, `deterministic`) carries `E.L.I.T.E Manager · Capgemini · Jul 2024 – May 2025`, a job the user never held, with the IIM Lucknow festival bullet attached; the same version promotes `Management Consulting Intern` to `Strategy Consultant`. It is a **tailored** version, not a master, so it is a different path from the section loss above. Two detector attempts produced only false positives (curly-vs-straight apostrophes; tailored versions legitimately hiding bullets their predecessor showed). **Do not trust a count here until a sound detector exists.**

    ⚠️ **Two wrong turns this measurement cost — do not repeat them.** (a) Postgres regex uses `\y` for a word boundary; `\b` is a backspace, so `\b(we|i)\b` silently matched nothing and the first sweep under-reported. (b) `substring(x from '…(group)…')` returns the FIRST capture group, not the match — a scan that looked like evidence of assistant-voice text in 8 users was actually returning the matched keyword alone, and all 8 were the skill "Large Language Models".

    **Checked and CLEARED — not a data leak.** 13 colliding `body_text` hashes span 36 users, the worst being one named person's CV on **13 distinct gmail accounts** over 2026-08-02→05. `content_hash = sha256(raw_text)` (`cv_workflow.py:344`) and BOTH lookups that consume it — `find_by_content_hash` and `find_by_idempotency_key` — filter on `user_id`. There is no unscoped `content_hash` read anywhere in the backend. Identical hash therefore means identical uploaded text: a cohort uploading the same sample CV, almost certainly a demo or workshop group. No cross-user reuse path exists.

48. **`CVStructured` has no `achievements` field, and the section list is a closed six-key tuple — so the one section every consulting CV requires cannot exist.** `summary · experience · projects · skills_line · education · certs` — `frontend/lib/api.ts:1237-1246`, `frontend/lib/cv/section-order.ts:8`, `backend/app/services/cv_section_order.py:12`. Headings are fixed by the `HEAD` map at `frontend/components/cv/builder/cv-paper-sections.tsx:52`, so "Achievements and Leadership", "Advisory and Agentic Pursuits" and "Skills and Courses" are all inexpressible. In the Amazon build all three had to be written outside the platform.

    This is not only a labelling limit. With no neutral container, concurrent and entrepreneurial work has nowhere to go but `projects`, and **"Projects" demotes it** — a ₹2 Cr advisory engagement and a live product both read as side projects. The closed taxonomy forces a positioning error on exactly the users with the most interesting histories. Related: `CVProjectItem` is `{name, dates, bullets}` (`api.ts:1222`) with no `role` field, unlike `CVExperienceItem`, so "Founder & Product Manager" has to be jammed into `name`. Neither type carries a **company descriptor**, so unknown employers (Finlatics, Hitwicket, Myro) can never be explained to a recruiter.

    Minimum fix: one user-titled section type with ordered entries, or at least `achievements` + a free-text heading per section. Additive migration; `normalize_section_order` already drops unknown keys, so old rows stay valid.

49. **The page-fill meter is wrong in both directions and it gates the download.** `frontend/components/cv/builder/use-playground-model.ts:155-167` counts identity + `summary` + `experience` + `skills_line`. It never counts **projects, education or certs**. `playground-view.tsx:256` gates Download on `m.pageFill.fits`, and `trim-confirm.tsx` offers to auto-hide bullets on its verdict.

    Measured twice in one session against a real Chrome print render:
    - CV with a populated `projects` section: **meter 54%, truth 62%** of printable height — understated by 34 points, because it ignored the entire section.
    - Final CV: **meter 110% ("spills onto 2 pages"), truth 1 page at 97% fill.** It would have blocked the download of a CV that fits, and offered to delete bullets to fix a problem that did not exist.

    The model is `charsPerLine: 98, lineBudget: 50` (`frontend/lib/cv/page-fill.ts`) — a constant-width approximation that matches no real typography. The build also showed **line-height, not font-size, is the binding constraint** on one-page fit (10.1pt/1.22 fits; 10.0pt/1.24 does not), and nothing in the product exposes either. Fix: measure the real rendered height of the export DOM at the export's own page width, or drop the hard gate to a soft warning until it can.

50. **Desktop cannot add a project or a role. Mobile can. Same account, same CV, capability split by viewport.** `ProjectsBody` returns `null` when `cv.projects.length === 0` (`cv-paper-sections.tsx:179-180`), and `EmptySection` — the only "add" affordance — is wired to exactly two sections, summary (`:102`) and skills (`:130`). Desktop has `onAddBullet(roleIndex, text)` and `onReorderRoles` but **no add-role, no delete-role, no move-between-sections**. Mobile has all of it: `mobile-cv-sections.tsx:105` (Add experience), `:139` (Add project), with delete and move. It is gated at `library-view.tsx:59` — `if (!isDesktop)`.

    Inverse gap: desktop can drag-reorder **sections** (`cv-document.tsx:184`); mobile cannot. **Neither surface alone can build the target CV.** Compounding it, the mobile editor writes through `useMasterAutosave` to the **master**, not to the job-tailored version, so the one surface that can add a section edits the wrong document for a tailored CV.

51. **The `unquantified` check measures digits, not impact — the label and the penalty both claim otherwise.** `content-checks.ts:150`: `QUANTITY_RE` matches any digit, `%`, currency symbol, number word or magnitude word. `isUnquantified` (`:155`) is its negation. The category is rendered as **"Unquantified impact"** (`:57`) and carries the **highest penalty in the system, 3 points** (`:70`) — "quantification is the highest-signal recruiter check". The rail title is "Put a number on this line".

    Measured on the Amazon CV at its weakest draft: **the engine passed 13/13 bullets; an outcome-led review passed 4/13.** Two of the engine's passes were a **year** ("Robotics in Life Sciences **2030**") and a **count of framework levels** ("a **five**-level maturity framework") — neither is an outcome, neither is even a result. The `detail` string is the honest one: *"Add a number to show scale."* **Scale is not impact**, and that distinction is the whole difference between an ATS-clean CV and one that survives a bar-raiser.

    Fix is a second, separate check — does the bullet contain a *result* (delta, outcome, adoption, money, time) as opposed to a *scope* number — not a wider regex. Keep "add a number" as the cheap check; add "this number describes how big the thing was, not what changed."

52. **Empty `certs` leak a bare `CERTIFICATIONS` heading into every downloaded CV.** `frontend/lib/cv-compose.ts:177-184` pushes the heading whenever `keptCerts.length`, and `cv.certs.forEach` never filters blank strings. Shivam's master carries `certs: [""]`, so every CV he has downloaded ends with a `CERTIFICATIONS` heading and a lone `• `. Present in v111's stored `body_text`. One-line fix (`filter(c => c.trim())`), but it has been shipping in user-facing PDFs.

53. **Nothing tells a user their CV lost something, and nothing lets them get it back.** Every version is stored in `cv_versions` with full `cv_structured` + `body_text`, and `cv_master_revisions` exists — but there is no diff between versions, no "this rewrite removed a section" notice, and no restore. Recovering Shivam's leadership and achievements content took a manual SQL walk back through 78 versions to v38. A user cannot do that, and has no reason to suspect they need to.

    This is the recovery half of #47: that item stops the damage, this one surfaces and reverses what already happened. Per THE FORWARD PASS this is **a heal, not a backfill** — the diff is computed and offered when the user next opens their CV, on a surface the cohort already walks; nothing is rewritten while they are away. 407 users have uploaded a CV; how many were silently degraded by the rewrite path is **unmeasured and should be the first query**.

54. **The gold CV needed nine screens the product does not run.** Each is cheap, deterministic, and each caught something real in the Amazon build:

    | Screen | What it caught |
    |---|---|
    | CV location vs job location | CV said "Gurgaon, Delhi, Hyderabad"; the role is Bengaluru — an auto-filter risk before a human reads it |
    | Header title vs employment titles | Header claimed "Product Manager"; no employment record carries that title |
    | Date overlap across roles | Finlatics Jan 2019–Jul 2024 overlapped JLL and Capgemini with nothing marking it concurrent |
    | Same figure restated | €500K, $500K and $2M+ across three bullets read as three wins; they are one claim |
    | Figure contradicts an earlier version | Revenue baseline was `₹10L` in v38 and `₹0` in the current master |
    | Duplicate achievement across roles | The RAG platform was written as two separate bullets under two different roles |
    | Certification vs course | A course was about to be listed under CERTIFICATIONS — a claim Amazon verifies |
    | Stale relative period | "50+ inbound requirements in 10 months" on a role 16 months old |
    | JD term the CV never answers | The JD names "tradeoffs", "ambiguity" and "accounting"; the CV said none of them |

    Seven of the nine are pure string/date comparisons over data already stored; two need the JD, which the platform already extracts (14 requirements were pulled for this job). None needs a model. These are the checks that move a CV from ATS-clean to interview-grade, and they are the reachable half of #51.

---

## INTEGRATOR ITEMS

### 2026-05-31 - Post-Application Intelligence + Myrology

- **7-day tracker prompt becomes a branch, not a disappointment loop.** Ask "What happened with this application?" and route into Practice:
  - **No Response Recovery:** mark ghosted/no response, preserve dignity, suggest follow-up/referral path, adjacent targets, and skill practice.
  - **Moved Forward:** update stage, generate company-specific interview prep, case-study practice, and next milestone tracking.
- **Practice becomes the central action router** for post-application work: Skill Practice, Referral Route, Interview Prep, No Response Recovery, and Company Intel.
- **Referral Intelligence = premium tactical loop.** Available from saved/applied jobs, strongest after no response. Initial automated unlock = **500 XP**. Output: ranked referral targets, warm-intro plan, and next actions for the target company/job.
- **Referral data-source tiers are locked:**
  - Tier A: API-backed LinkedIn analysis when approved scopes/data access permit.
  - Tier B: user-assisted fallback via pasted LinkedIn URLs, known contacts, or exported contacts.
  - Tier C: Myro repository of opted-in referrers plus founder/HITL company notes.
  - Hard rules: no scraping, no auto-DMs, and no pretending to access LinkedIn graph data that the API does not provide.
- **Company reports split evidence from advice.** Verified Intel = source-backed facts, founder/HITL notes, hiring-process observations, user-submitted outcomes, referrer availability. Strategy Plan = referral target, case-study angle, skills to practice, follow-up message, interview prep.
- **Pricing boundary:** XP buys automated intelligence and prioritization. Cash buys human attention, deeper premium reports, astrologer/founder consultation, and eventually access to the company/referrer network.
- **Myrology stays separate from core Myro.** It is an opt-in premium subbrand, not part of Myro Score or job ranking. The live `/myrology` surface should remain a simple interest/payment/booking funnel, not a live report engine. ⚠️ **"Not a live report engine" bans MYRO COMPUTING a reading — it does not ban rendering one a human wrote.** Read as the latter on 2026-08-26 and used to wrongly block the delivered-map surface; corrected in the same session. The two-lens guardrail below is the real constraint.
- **Myrology report coverage:** career domains, role archetypes, work environments, abroad/relocation indications, timing/dasha windows, strengths, risks, remedies, and reflection prompts. Requires explicit consent for date, time, and place of birth.
- **Two-lens guardrail:** Myrology may suggest career directions, but never overrides evidence-backed CV/skills/market recommendations. If Myro data and Myrology agree, use that as a narrative moment. If they conflict, show them as separate lenses. No guaranteed job/interview/abroad claims.
- ~~**Implementation follow-up:** live code currently treats Myrology as an INR 499 entitlement.~~ **RESOLVED — verified in code 2026-08-26.** `payments.py` `PRODUCTS["myrology"]` is `price_paise=29900`. ₹299, one-time, with 3 lifetime sessions. The ₹499 claim had been stale long enough to be quoted back as a live blocker. **Still decision-gated:** any NEW tier (the handoff proposed ₹1,499 / ₹3,999 "Go Deeper") is a new SKU needing its own `PRODUCTS` entry, entitlement key, refund copy, and a human to deliver it — one astrologer. So is any change to what ₹299 includes.

---

## SKILL INTELLIGENCE PAGE — REDESIGN TRACKER (Backlog #10)

**Phases 1–3 ✅ DONE 2026-05-16** — SkillCard + Log-to-Forge + CV/Intel links · stat-line reframe · `?skill=` deeplink · color-coded domain strip · ScoreRing hero + WeaknessSpotlight · DomainRadar SVG-only · inspector absorbed into radar card · `components/skills/` extraction (page <300 lines). Dead code deleted: `dashboard/domain-drill-dialog.tsx`, `dashboard/domain-radar.tsx`. Full detail in `docs/session-history/2026-05.md`.

**Defer to v2:** domain layer separation · Rename Mirror→Myro in remaining strings · Pillar pages `/careers/*`

**Mobile QA findings (2026-05-21):**
- `domain-accordion-row.tsx:57` — grid template `20px 1fr auto auto 52px 32px` is 6 cols but row has 5 children + 120px progress bar → overflows 375px viewport. "BIGGEST GAP" badge clipped right edge. Fix: trim unused 32px col + cap progress bar to 70px <720px.
- Three stacked control rows (VIEW / SORT / SHOW) eat vertical space. Consider single "Filter" pill opening a sheet, or moving SORT + SHOW into ⋯ menu.
- Above-fold stat line "6 domains · 17 skills · 0 need proof · 3 below 40%" — dense, candidate for 4 mini stat tiles like intel-pane.

**Shareability / Social — Phased:**
- **v1 (next):** Public profile page (`/profile/{token}`) — live Mirror Score + blurred domain breakdown. Invitation-first (viewer prompted to get their own score). Job co-tracking: two users targeting same job/company see each other's readiness % → accountability loop. Reuses `job_applications` data.
- **v2:** Skill peer matching — suggest users with complementary skill gaps (strong where you're weak).
- **v3:** Mentor/mentee — higher Mirror Score users visible to lower-score users in same domain.

**Defer to v3 — Mobile (Play Store):**
- Extract `lib/api.ts` + `lib/session.ts` into platform-agnostic `packages/api-client/` (inject AsyncStorage adapter for RN, localStorage adapter for web)
- Add `/v1/` prefix to all backend routes before mobile launch (versioning contract)
- Mobile auth via Supabase React Native SDK (same backend, AsyncStorage token storage)
- `device_tokens` table (user_id, fcm_token, platform) + `/push/register` endpoint → FCM/APNs for diary reminders + score update push notifications
- React Native app (Expo) targets Android Play Store first, iOS second
- Prerequisite: shareability (public profiles) must ship before mobile — it's the referral hook

---

## MOBILE — v2 NATIVE APK (Backlog #9, v1 PWA ✅ CLOSED 2026-05-19)

v1 PWA detail archived in `docs/session-history/2026-05.md`. v2 kicks off after 1000 PWA users.

### v1.5 — Android APK via TWA (Play Store NOW, ship current PWA — chosen 2026-07-23)

**Decision (Shivam):** ship a Trusted Web Activity wrapper of the existing responsive PWA to the Play Store now — Path A over the full Expo native rewrite (Path B = the v2 section below). Product is 100% mobile-responsive + already has `mobile/redesign/` surfaces; TWA = zero React rewrite, a signed `.aab` in days.

**✅ STEP 1 BUILT + pushed Develop 2026-07-23 (the pre-flight fixes that make TWA install-clean, not read as a webview):**
- **manifest** ([public/manifest.webmanifest](frontend/public/manifest.webmanifest)) — `start_url` `/home`→`/market` (`/home` is the retired Collections-cutover redirect stub → cold launch was a blank screen then JS-redirect; `/market` is the real Jobs landing + mobile nav tab 1); `background_color`/`theme_color` `#050A18` (pre-#28 navy) → `#F9F9F9` (canonical light Firecrawl paper → correct splash + task-switcher brand).
- **maskable icon** ([public/brand/icon-512-maskable.png](frontend/public/brand/icon-512-maskable.png)) — was byte-identical to `icon-512.png` (a fake full-bleed dup → adaptive mask would crop the logo). Rebuilt edge-to-edge dark with the signal-dot ring inside the 80% safe zone → survives circle/squircle masks.
- **service worker** ([public/sw.js](frontend/public/sw.js) + [components/pwa/sw-register.tsx](frontend/components/pwa/sw-register.tsx), mounted in providers) — minimal, prod-only: navigations network-first → cached `/offline` shell fallback; hashed static (`/_next/static`, `/brand`) cache-first; cross-origin API (`api.himyro.com`) untouched. Satisfies install criteria + kills the in-app Chrome error page when offline.
- **offline shell** ([app/offline/page.tsx](frontend/app/offline/page.tsx)) — self-contained inline-styled, theme-aware, noindex (added to `NON_PUBLIC_SEGMENTS` in the ui-drift guard — utility route, not a nav surface).
- **assetlinks scaffold** ([public/.well-known/assetlinks.json](frontend/public/.well-known/assetlinks.json)) — placeholder `package_name: com.himyro.app` + `REPLACE_WITH_SIGNING_KEY_SHA256_FINGERPRINT`. **Without this file the TWA shows the Chrome URL bar → reads as a wrapper.** Chicken-and-egg: keystore → SHA-256 → fill this → publish on himyro.com → THEN build APK.
- Green: tsc 0 · next lint 0 · `next build` ✓ (`/offline` static) · ui-drift clean.

**OWED (Shivam) — the remaining TWA path, in order:**
1. **`main` merge** (this Develop work → himyro.com must serve the fixed manifest + assetlinks + SW before any APK is built against prod).
2. **⚠️ THE REAL GATE = one real-device authed mobile QA pass** — the whole `mobile/redesign/` surface (Jobs/Collections/CV/Prep/Profile) was built+pushed but NEVER eyeballed on a real authed mobile session (sandbox has no token). Must verify before an APK puts the bugs in Play Store reviews: login → **CV upload on throttled 3G** (BUG-2 TUS resumable path — the #1 funnel action) → 4 bottom-nav tabs → #41 login waterfall → PR-F `/skills` 375px (sticky-pill overlap + SE14 icon-only buttons).
3. **Confirm package name** `com.himyro.app` (or pick another reverse-domain).
4. **Generate upload keystore** → take SHA-256 fingerprint → give it to Claude → Claude fills `assetlinks.json` + commits → merge main.
5. **Build:** Bubblewrap/PWABuilder → signed `.aab` → **Play Console ($25 one-time)**.
6. **Native push (FCM)** — the actual retention hook (diary/score/new-match notifications). Needed under TWA too; = v2 prerequisite 3 (`device_tokens` + `POST /push/register`). Do this AFTER install is live, then decide if native shell (Path B) earns its weeks.

---

### v2 — full Expo native (Path B, still gated on 1000 PWA users)

**v2 prerequisites (all must ship first):**
1. `packages/api-client/` extraction with injectable storage adapter (AsyncStorage/localStorage).
2. All backend routes prefixed `/v1/` — versioning contract.
3. `device_tokens` table + `POST /push/register` — FCM/APNs.

**v2 layout:** `mobile-native/` sibling folder (Expo SDK 51+ TS), NOT inside `frontend/`. Native libs land only in `mobile-native/package.json` (Expo-on-Next bundler pollution = Vercel break).

**Decisions still open:** monorepo tool (lean turborepo), auth flow (deep-link vs `expo-auth-session`), diary push cadence (8pm local default), Android-first.

**Open deepenings:**
- ⏸ `<ResponsiveStack>` primitive — DEFERRED. Trigger: any new page adding 4+ `tm-<page>-*` class hooks.
- `packages/mobile-shared/` extraction — blocked on `packages/api-client/` + turborepo decision.

---
