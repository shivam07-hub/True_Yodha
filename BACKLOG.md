# MYRO — Open Work

> Open work only, in the order of the loop map (Shivam, 2026-09-30). Every item
> names the loop step it fixes; anything that fixes none is parked in
> [ARCHIVE.md](ARCHIVE.md) with one line saying why. **Myrology is exempt** — a
> second product line. VERIFY IN CODE before building: entries rot.
> Cockpit: [CLAUDE.md](CLAUDE.md) · the grill that set this order: ARCHIVE, 2026-10-02.

Career-story items are **CS-12 … CS-16**. Inside the old tracker they were
numbered 12–17 and collided with global #12–#17; renamed 2026-10-02.

---

## THE ORDER

Broken steps first, nearest the north star (qualified applications sent) first.

| # | Step | Item | Spec · owner | Next |
|---|---|---|---|---|
| 1 | Find the job | **#55** a returning user's list never vanishes | [ARCHITECTURE_RETURN_LOOP.md](ARCHITECTURE_RETURN_LOOP.md) · decisions taken below | S0 measure → S1 Verdict Currency |
| 2 | Apply | click → "Did you submit?" → application, measured | `core_loop_events` + `job_apply_intents` | read the funnel on prod after the next merge |
| 3 | Repeat | **#59** golden-list digest · the next hunt after a listing closes | [ARCHITECTURE_GOLDEN_DIGEST.md](ARCHITECTURE_GOLDEN_DIGEST.md) · Cursor | S1 migration + `golden_list.py` |
| 4 | Front door | **#57** "Which job do you want?" after upload · partner SSO lands on the upload (22% of partner people upload vs 67% direct) | [ARCHITECTURE_FRONT_DOOR.md](ARCHITECTURE_FRONT_DOOR.md) · Cursor | S0 partner landing |
| 5 | Tailor + download | **#58** CV Tier A | [ARCHITECTURE_CV_TIER_A.md](ARCHITECTURE_CV_TIER_A.md) · Cursor | S1 blank certs |
| 6 | Pay | **#56** the ₹199 Apply Pack | [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md) · Cursor | S1 settlement |
| — | Upload + direction | U1–U3 (QA list) · #46 S6 · #41 speed | below | — |
| — | Prepare | #45 evidence bank · CS-12 | below | grill first |

Specs Cursor builds from, each slice its own commit with six gates green:
RETURN_LOOP (#55) · PAYMENTS (#56) · FRONT_DOOR (#57) · CV_TIER_A (#58) ·
GOLDEN_DIGEST (#59) ·
[ARCHITECTURE_LISTING_TIME.md](ARCHITECTURE_LISTING_TIME.md) (steps 1–2 done:
de-seed `f7dd4735`, `listing_time.py`; verify 3–6 in code) ·
[ARCHITECTURE_CONTRACTS_BY_TYPE.md](ARCHITECTURE_CONTRACTS_BY_TYPE.md) (make
`compute_match_health`'s `freshness` required).

---

## 1 · FIND THE JOB

**#55 Return Loop — Shivam's decisions, 2026-09-30.** Show stale verdicts after
current ones with **no word label** (a motion state only) · on return, re-rate the
rows the person can already see first, then the normal 8-per-tick drain · when the
re-read lands, one line: **"N new · N moved up · N closed since {day}"** (the
existing `progress_line`) · the email transport (S4) goes **only to the golden
list** — see §3. Do not bump `PROMPT_VERSION` casually until S1 ships.

**The corpus is the scraper repo's (Shivam).** Running again since 2026-10-01 —
28,120 active jobs younger than 7 days on 2026-10-02. This repo only reads jobs;
never measure ingestion with `jobs.ingested_at` (an extension save masks a stall).

⚠️ `jobs_added_1h` on the public landing page is structurally **0 for 23 hours
of every day** (`repositories/jobs.py:644,629,676` — a day marker compared to
`now − 1h`). Fix from `ingested_at` or delete the field. In the first spec.

7e. **Semantic retrieval is PAID FOR and UNWIRED — and its one caller-ready
    module would fail silently if wired today.** Measured 2026-09-25, against the
    live database, after this module was proposed for deletion as dead code.

    **It is not dead.** `private.job_embeddings` holds **43,803 embedded live
    jobs** (halfvec 768, HNSW, all `status='complete'`), last embedded
    2026-09-10, with **269 `pending` enrolled at the most recent ingest
    (2026-09-17)** — the sister scraper repo is still filling it. The RPC
    `match_jobs_semantic` is deployed and reads that table. What is missing is
    the caller: `backend/app/services/matching/semantic_candidates.py` has no
    production importer, and CONTEXT.md **CandidatePool** already reserves the
    seam ("swap `title_ids` for semantic ids, same merge").

    ⚠️ **The module's docstring describes a schema that no longer exists** — it
    says the vector is `jobs.embedding` and that everything is inert while those
    are NULL. There is no `jobs.embedding` column; the design moved to
    `private.job_embeddings`. Anyone reading that file today concludes, as I
    did, that the feature is inert.

    ⚠️ **Its RPC call does not match the deployed function, and the mismatch is
    silent.** The module sends `query_embedding` / `p_countries` / `match_count`
    (`semantic_candidates.py:74-79`); the live signature is
    `p_query_embedding, p_match_count, p_target_countries, p_include_remote,
    p_excluded_job_ids`. Wired as-is, the call fails and the fail-soft `except`
    returns `[]` — the feature would look switched on and retrieve nothing, for
    as long as nobody checked ([[feedback_a_scoping_key_must_name_something_that_exists]]).

    **Why this is a decision, not a chore:** unioning semantic ids into the
    triage pool widens what reaches the brain, and the brain is the LLM spend.
    It needs a cost answer and a quality measurement (`match_quality.py`) before
    it is switched on — which is exactly what ADR-0022's "recall may use any
    index, a verdict is always graded from skills" already permits.

7f. **The /market list is served unranked and presented as ranked.** Measured
    2026-09-25; `metric feed.unranked` still fires in prod (most recent that day
    05:37 UTC, 40 rows). `routers/jobs/list.py:498` logs it and returns all 40
    rows in retrieval order with no verdicts and no divider. Ranking is
    `POST /jobs/feed/warm` (`list.py:514-557`), SYNCHRONOUS in the request at
    98–103s: 10 jobs (`feed_warm.WARM_SHORTLIST_SIZE`) ÷ 3 concurrent
    (`llm_ranker.py:46`) × up to 45s (`config.py:183`). The client abandons at
    7,000ms (`frontend/lib/api.ts:4379`), so `use-feed-warm.ts:79` never
    invalidates and the ranked rows land after the user has gone, behind a
    30-minute `staleTime`. Two numbers that must agree, in two modules, 14x apart.
    Fix shape: warm onto the durable rail (ADR-0008 Background Job + Work Lane —
    `background/registry.py` has no feed-warm handler), and give the list the
    read/unread state the ROW already has (`Provisional Match` / `verdict:
    "checking"`, divider in `lib/jobs/track-sections.ts`).
    ⚠️ Two tests currently pin the defect and must be replaced, not worked
    around: `test_feed_ranking.py:62` and
    `frontend/tests/market-browse-contract.test.ts:74`.
    Rule to keep: rank down, never hide (`test_feed_ranking.py:52`).

**#36 status, 2026-10-02:** slices 1–2 are shipped — de-weekly, the inbox and
`<NotificationBell>`, and the drain that starts at the save with "N fresh matches"
(`0d78726c`). Slices 3–5 are open; confirm which before building. The lock below
is the original grill.

36. **Event-driven matching + Career-Ops-brain-everywhere — GRILL-LOCKED 2026-07-09 (`/grill-me`, Kunal-Shah lens per fork), NOT built.** Trigger: Shivam — (1) kill "weekly scrape" (scrapes are continuous, by company·industry·location, driven by POWER USERS' targets but shared with ALL users); any user gets a **notification when a fresh scrape lands + their matches auto-update**; (2) **Career-Ops brain = the ONE standardized matcher**, rating as many cards as possible (experience-aware relevance + one standard). **Supersedes the weekly model:** `batch_week` as eval-freshness key DIES → eval identity permanent `(user_id, job_id)`. ⚠️ Corrected fact: `user_job_matches` is already DURABLE (upsert, no delete, evals cached+reused free via `on_demand`/`feed_warm`/`ranking`); the "new jobs" signal today is an in-app badge (pull-on-visit), NO push/email webhook exists; refresh already charges 150 coins only for vanity re-runs with no new jobs (`job_refresh/facade.py`). **Locked (N1–N5):** N1 in-app **bell + debounced digest** on **fresh matches** (any new, v1), ping carries the match, WhatsApp/email later. N2 auto-update on real new jobs = **FREE**, 150-coin only for vanity re-runs, user-pulled ADDITIONAL matching costs coins. N3 eager-rate **top 10–15 STRONG-gated** (never padded) + rest **on-open cached**, deterministic overlap = placeholder, **"want more" → IntentChat → coin expansion**, continuous loop. N4 **deterministic pre-filter → power/active priority → per-scrape cap** on RQ + Provider Budget (dev+prod share ONE Redis+budget → cap protects prod), compute-then-notify (never speculative). N5 **fold Agent Picks into the same brain pass** (auto-select strong top-N + grounded personalized "why" + tier → `user_agent_job_picks`, no-fab guard), human override = reserved power-user perk. **5 vertical slices, per-slice go, Slice 1 (de-weekly + scrape event pipeline) isolated first (mutates the live matching key):** (1) de-weekly + event pipeline → (2) `user_notifications` inbox/bell → (3) brain-everywhere read (audit all card surfaces read one `MatchEval`) → (4) Agent Picks auto-gen (fold N5) → (5) "want more" coin expansion. Overlaps in-flight jobops work + Agent Picks band (#already-built). Memory: `project_event_driven_matching_brain_everywhere`.

37. **Ranked job-skill importance (extension + matcher) — ✅ GRILL-LOCKED 2026-07-24 (Shivam, 3 forks). BLOCKED on sister-repo coordination, NOT yet buildable.** Trigger: extension "Track this job" popup screenshot — extracted skills render as flat PRIMARY/SECONDARY chip buckets; Shivam: *"rank the extracted skills by how important they are for the role — a better basis for deciding if a job is a good fit."* Current state (verified in code 2026-07-14): `backend/app/services/job_importer.py` splits binary primary/secondary via a deterministic required-zone term match (hardcoded confidence 0.82/0.68, [job_importer.py:113](backend/app/services/job_importer.py#L113)); scraped jobs carry only `job_skills.is_primary BOOLEAN` (canonical skill source, written by the `firecrawl_Supabase` scraper); the deterministic matcher flat-counts matched skills.

    **LOCKED (3 forks):** **(F1) Ordinal rank** — 1st/2nd/3rd most important skill per job, not a numeric weight or 3-tier bucket. **(F2) Whole matcher, not extension-only** — feeds `job_matcher` weighted overlap, playground Ready/gap ranking (which gap matters MOST for THIS job — dovetails with Lane C JD coverage, memory `project_story_memory_jd_interview`), heatmap, AND extension chips; interacts with #36 N3 brain-eval as the deterministic-layer signal underneath the holistic LLM rank, not a replacement for it. **(F3) Extraction runs on the judgment lane** (`get_judgment_provider`/tier-2c+, per `feedback_no_cheap_models_judgment` — importance-from-JD-language is a judgment call, not counting) — current deterministic primary/secondary split stays as fail-soft.

    **⚠️ ROLLOUT GATE (Shivam): do NOT ship until BOTH extension-imported AND scraped (firecrawl_Supabase) jobs carry `job_skills` ordinal rank — a two-tier corpus (some jobs ranked, most not) was explicitly rejected.** This makes the item **blocked on sister-repo work**, not agent-actionable alone. Next agent: (1) open the coordination conversation with the scraper side (what does firecrawl_Supabase need to emit ordinal rank per skill it already extracts); (2) only once that path is real, build in this repo: extraction emits ordinal rank from JD language (judgment lane) → `job_skills.rank` column + import-path equivalent (shared-Supabase migration, manual-apply + PostgREST reload) → wire the 4 consumers above.

**Desktop never shows the employer's track record — it was built into a dead
panel (found 2026-10-03).** `components/dashboard/detail-body.tsx` lost its only
mount on 2026-09-02 (`e3c38423`, the priority-heart removal); four days later
`66871eb8` built the employer record into it, so only the phone sheet
(`mobile/redesign/job-detail-sheet.tsx:112`) ever shows `EmployerRecordNote`. The
whole subtree is dead — `detail-body`, `lenses`, `more-roles`, `lens-company`,
`deepeners` — while `dashboard-drawer-content.test.ts` and
`employer-record.test.ts` still read its text and pass. Mount the employer record
(and `ListingLiveness`) in the live desktop job panel, retarget those tests at
it, then delete the subtree on the way past.

**Stage A tags business jobs with a genetics skill — and it is growing
(re-measured 2026-10-03).** "Transformation (Genetics)" sits on **2,637** jobs
(2,057 live; 881 from ingests since 2026-09-30) across 101 role families, against
624 live for "Business Transformation". 2,636 of the rows are `stage_a` — **our**
writer, `services/skill_floor.py` → `skill_extraction.extract_skills`, not the
scraper. Cause: `_bare_form_present` (`skill_extraction.py:134`) strips the
qualifier and trusts capitalisation to separate the senses; business postings
capitalise "Transformation" too. It feeds the demand profile, so it weights scores,
prep plans and matching. **Safe now:** a bare-form match inside the span of a
longer matched skill is dropped (766 jobs carry such a skill; no true match can
be lost). **Needs a measurement first:** requiring qualifier evidence for bare
forms changes every job's tags — run `match_quality.py` before and after.
**Needs Shivam:** removing the 2,636 existing rows (destructive) — or let Stage A
re-run on the affected jobs once the fix ships.

**CS-14** · **Step 2 of the loop reads zero Career Stories.** *Goal-level gap, found
    2026-09-13. Needs a grill: this is the matcher, not a corner.*

    "Find the job closest to your aspiration" runs on the skill layer. Every
    module under `services/matching/` has zero reservoir reads. So the match is
    made against *what skills a CV lists*, never against *what the person
    actually did* — while the stories sit there embedded, with pgvector on them
    and a working cosine already used by the projection. The single biggest
    unexploited asset on the platform.

---

## 2 · APPLY

The north star is measured here and is near zero: 3 people, 5 applications, ever;
no Apply click from a real account since 2026-09-22. The capture is built
(`3ff55125` "Did you submit?" answered once; `a624c2e1` Apply after download).
Read clicks → answers → applications on prod after the next merge before building
anything new. QA check **A1** below: Apply opens the company's own posting.

**Extension apply door (Develop 2026-10-06, needs a Web Store release — Shivam).**
The popup now asks Myro which of the user's jobs the page is (Page Entry,
CONTEXT.md) and, on a tailored page, leads with "I applied" — the same answer
write as the web. A save and the first "applied" both queue the judge, so an
extension application can count as qualified. Not detection: the user's click is
the only writer. Measure after release: `applied` rows on `ext_` jobs. A job from
Myro's list marked applied in the popup is indistinguishable from the web today;
add a surface column only if the count needs it.

**AF · ATS form auto-fill — engine built, browser layer not (owner: unassigned).**
`Chrome_extension/src/autofill.js` (`planFill`, 7 tests) maps the Career Profile
(notice period, current/expected CTC, interview availability…) onto Workday /
Greenhouse / Lever / Oracle HCM / Naukri form labels, and `fetchCareerProfile` +
the `chrome.storage` cache feed it. Nothing runs it: no content script detects a
form, writes values, or shows the review chip, so it is unreachable today.
Next: a content script on known ATS hosts → "Myro can fill this" badge → fill in
place, highlighted, one undo, NEVER submit (grill locks L6–L10, memory
`project_career_profile_capture`). It speeds the exact page the apply door sits
on; build it after the door's first measurement.

**CS-15** · **Step 5 leaves no trail back to the stories.** *Small, but it is what makes
    `repeat` mean something.*

    `cv_of_record` freezes the CV that went out into `cv_application_attempts`
    with zero reservoir references. So Myro knows what you sent and knows what
    you are made of, and cannot join the two: which stories won an interview,
    which never get picked, which phrasing was on the CV that got a reply. Pass
    two of the loop is supposed to be better than pass one; this is the join that
    would make it so.

---

## 3 · REPEAT

**#59 Golden-list digest (Shivam, 2026-09-30) — [ARCHITECTURE_GOLDEN_DIGEST.md](ARCHITECTURE_GOLDEN_DIGEST.md).** The golden list IS
the instant-seeker list: one column, `user_profiles.golden_list_since timestamptz`
(empty = not on it). Shivam sends names; an agent matches, Shivam confirms, the
agent stamps. The digest goes only to active members: first "you tailored a CV
for X — apply", then new Apply-grade jobs with a Tailor CV link · at most one per
3 days · only when something exists · one-click unsubscribe · 0 judge calls.

**Closed listing → next hunt (LOCKED 2026-09-14).** One complete miss — or any other gone-signal — writes `closed`, the Collection card poofs, and people still sitting on it get one `listing_vanished` notification. The tailored CV and its pointers stay (aspiration signal, not a hunt). What is NOT built: the path after that ping that gets them onto the next live role and through tailor + apply faster. Do not add a Closed chip back.

---

## 4 · FRONT DOOR — #57 · [ARCHITECTURE_FRONT_DOOR.md](ARCHITECTURE_FRONT_DOOR.md)

After upload, one screen: **"Which job do you want?"** → paste a link or JD (the
existing import, `/jobs/import/*`, today only on Collections desktop) · save from
any site with the Chrome extension (desktop only, `EXTENSION_WEBSTORE_URL`) ·
show me jobs that fit. Every choice lands in the tailor playground. "Paste a job"
also sits at the top of /market and on mobile. Direction moves **after** the first
tailored CV. Target: upload → tailored CV downloaded in **<10 min, ≤5 clicks**,
read from `core_loop_events`. Evidence (own accounts excluded): 12 of 17
tailorers did it in the session they uploaded (median ~7 min); 96% of uploaders
never reach tailoring; the one real person who imported their own jobs tailored a
CV for both. QA check **U4** is its acceptance.

---

## 5 · TAILOR + DOWNLOAD — #58 · [ARCHITECTURE_CV_TIER_A.md](ARCHITECTURE_CV_TIER_A.md)

**Tier A, now (Shivam, 2026-09-30):** #49 page-fill meter gates the download ·
#52 empty certs heading · #50 add a role or project on desktop, and mobile edits
the job's CV not the master · #47/#48 minimum — the renderer keeps unknown
sections verbatim · a fabricated-role guard: a tailored CV cannot add an employer
or title the master does not have. **Tier B, after front-door numbers exist:**
#48 user-titled sections · #51 outcome not digits · #54 nine screens · #53 loss
notice and restore.

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

**CS-16** · **A role fold still has no receipt, so a confident judge may not fold.**
    *`82f96ac0` turned role auto-fold off rather than ship an irreversible one.*

    `apply_fold` moves every story under the duplicate role, archives the row and
    may widen the survivor's dates, recording none of it — so a wrong fold cannot
    be taken back, and "archive-only, restorable" was never true. Stories can
    auto-fold because `story_identity_fold` writes `moved.dup_added` and `unfold`
    takes back exactly that. Give roles the same receipt and the judge earns the
    write back. Until then every confident verdict is a question for the user.

38. **Role-dedup judge — ✅ BUILT; ⚠️ two corrections 2026-09-12, and L1 is now dead.** The judge never once answered: a fixed 1200-token budget for up to 24 pairs starved every call, and `parse_judge` defaulted an unanswered pair to `different`, so 47 pairs were stamped `keep_separate` unruled and a decided pair is never re-judged. Budget now scales with the batch; silence records nothing; the 47 were cleared and re-judged (44 keep_separate, 2 proposed, 0 folds). **L1's "auto-fold HIGH (archive-only, restorable)" was never true** — `apply_fold` moves every story under the dup and archives the row with no record of what moved, so there is nothing to restore from. Auto-fold is off: a confident judge proposes, and only the user's ruling folds a role. OWED to re-earn it: give roles the receipt + undo `story_identity_fold` has for stories (ADR-0023). Evidence for the caution: the first run where the judge actually answered returned exactly one `high`, and it was wrong (a volunteer club folded into the degree it sat inside). **Original build notes:** Slice 1: `role_dedup.py` (candidate pairs = company family OR same-kind date-overlap, capped/converging; ONE batched judgment-lane call; high auto-folds archive-only via most-storied keep + deterministic date-union; maybe→proposed; different recorded — pair never re-judged) + `role_merge_verdicts` (own-only RLS, pair-normalized UNIQUE) + 11 tests. Slice 2: post-ingest pass in `_ingest_entry` (best-effort, never fails ingest) + lazy Stories-visit sweep (`maybe_enqueue_role_dedup`, >12 active roles, per-process debounce, `role_dedup` @handler on LANE_FAST — the retro path, no cron) + `ProfileView.merge_suggestions/tidied_roles` + `POST /cv/reservoir/roles/merge-verdict` (user ruling = law, merged applies fold via token client/RLS); career suites 142 passed. Slice 3: Stories-tab `MergeCard` ("Same role? A ↔ B" → Merge/Keep separate) + "Tidied N duplicate roles" 7-day receipt (no silent mutation); `cv.career.mergeVerdict` wire; tsc0/lint0/ui-drift/build✓. **OWED (Shivam): main merge (backend+worker+FE ride Develop) + authed QA on a fragmented account (cards render, Merge folds, receipt shows after a dump).** GRILL-LOCKED 2026-07-14 (`/grill-me`, 5 locks + one Shivam nuance). Full locks: memory `project_role_dedup_judge`. **L1** auto-fold HIGH (archive-only, restorable) · confirm MEDIUM via card · identity-suspect NEVER auto-ruled. **L2** post-ingest incremental (judge pass in `_persist_extraction`, ONE batched call per dump, worker) + lazy full-inventory sweep on Stories visit (>~12 active roles ∧ changed since last sweep — this IS the retro path); NO cron, dormant users cost zero. **L3** inline merge cards on Stories tab between the two containers ([Merge]/[Keep separate]; identity → [Mine]/[Not mine]); verdicts persist in new `role_merge_verdicts` — human ruling is LAW, judge never re-litigates. **L4** kept-row labels untouched (user's own words; deterministic date-union only; NO LLM-authored reservoir labels) — **projection-time exception: at CV tailoring the LLM MAY propose a JD-aligned role-label framing on the artifact (grounded, titles actually held, never written back)**. **L5** visible receipt ("Tidied N duplicate roles · review"), `get_judgment_provider()`, fail-soft = keep separate, pair-text must carry company+title+dates+top story titles (Lane A starved-judge lesson). Build: `role_dedup.py` mirroring `story_dedup.py` + `role_merge_verdicts` migration (manual-apply + reload) + Stories cards. Original context (why deterministic reconcile_role can't do this): The 2026-07-14 mit20 repair (69→31 roles) was a hand-run: strong-model judgment over the full role inventory + 4 user-fork questions. The product only has deterministic `reconcile_role` (ingest) + `repair_reservoir.py` (same matcher) — exactly what LEFT the fragments; it cannot see "I&D India Sales Manager" == "GTM BD Manager, GCC Growth" (zero title overlap, needs world knowledge + date reasoning). Every heavy dumper fragments the same way. **Build sketch (mirror `story_dedup.py`'s proven two-stage shape):** new `role_dedup.py` — deterministic pass (existing reconcile_role) → ambiguous candidate pairs (same normalized company family OR same/overlapping date window) → ONE batched **judgment-lane** judge call (`get_judgment_provider`, [[feedback_no_cheap_models_judgment]] — a 4B would confidently wrong-merge) returning merge pairs + confidence → auto-fold HIGH (same company + same period + title-synonym; archive-only, restorable) · MEDIUM → one-tap user confirm ("These look like the same role — merge?", the Mentor-walk one-Q pattern) · identity-ambiguous (foreign-vs-mine) NEVER auto-archived, always user-ruled (PV1/trust). Triggers: post-ingest after a dump lands roles + the profile-poll self-heal spot. `/grill-me` forks before build: auto-fold threshold vs confirm-everything · confirm UI surface (Stories tab banner vs walk step) · retro-run for existing users. Memory: `project_story_memory_jd_interview` (repair detail = the ground truth for judge prompts).

**Measure, not build:** `upgrades_story_id` is still 0 in production — the L2
fold has never run for a real user. Watch it before building on the reservoir.

---

## 6 · PAY — #56

The ₹199 Apply Pack: 500 coins + one 24h Human Check, sold from the out-of-coins
modal and from "Human check before you apply" (ENG2). Spec, slices and Shivam's
checklist: [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md).

---

## UPLOAD + DIRECTION

Upload reliability lives in QA checks **U1–U3** below. Read #46 S6 in the light of
#57: direction now comes after the first tailored CV, not before it.

46. **Direction = one platform — S1/S2 SHIPPED 2026-09-12, S3/S4/S5 OPEN.** The Direction pipeline answered five questions with fifteen stored answers. ADR-0022 locked the model: **Myro stores closeness between skills and never the one bucket a job or skill belongs to; every fit is a graded score computed from skills.** Measured evidence lives in the ADR and in `CONTEXT.md` §Skill Closeness / §Family Profile — do not re-derive it.

    **✅ S1 Family Profile (`18d45071`, migration `20260912100000`).** `role_family_scope` + `role_family_profile` (1,465 / 124,229 rows) built in the existing refresh. `role_family_demand(families, seniority)` is the ONE reader: 4,311ms → **69ms** warm, and the Career Path band read 2,833ms ×3 → **9ms**. `is_primary` is off the demand path (Lock 4) — it is `required_level = 4` restated on Stage A rows and a 94.7% constant on the 296,886 legacy enrichment rows. That moved 460 of Software Development's 2,096 skills from a level-3 target to level 2, deliberately. The target-level rule now lives ONLY in `scoring.demand_rule`; the repository returns counts and stopped interpreting. Also added `role_family_labels.bands` (≥25% rule: 212 directions in one band, 95 in two, 4 in three, 19 in none).

    **✅ S2 Skill Closeness (`dec41c89`, migrations `20260912110000` + `…120000`).** `skill_closeness`, 7,287 bonds over 1,122 skills, own Tier-0 task, ~28.6s per ingest. Bonds counted **across companies** (≥3 companies, no single one over half) because 67.4% of raw bonds were one employer's template. Retired `role_family_market_skills`, `role_family_band_market_skills`, `role_family_aspiration_skills` after verifying zero callers.

    **✅ S3 Band step — SHIPPED 2026-09-13 (`48e751d5`, `5035af5f`, migration `20260913100000`). ⚠️ No authed run.** Asked first (`band → work → level → where → about`), **pre-answered and never blocking**: the best-fitting band arrives ticked and Continue stays enabled. A wall in front of a step converting at 76% was the risk not worth taking, and a ticked answer the person changes is still their answer — the same rule the level step has always followed. The landing rule skips the step for anyone who has answered. `p_bands` narrows SUGGESTIONS only; **search stays global**, and a direction picked from outside your fields widens them (`list_role_families` now returns `bands`).

    **The counts could not be live.** Measured 2026-09-13: `group by career_band` over live jobs is **14,393ms cold / 7,080ms warm**, 12,497 blocks read. So `career_band_scope` (four rows) is filled inside `refresh_role_family_labels` from the scan it already makes for `role_family_labels.bands` — nothing new read per ingest. Band fit is index-only at **9.2ms**. Live figures: Business/Product/Ops **20,659 jobs · 154 directions**, Engineering/Data **17,960 · 235**, Research/People **945 · 33**, Design & Creative **234 · 8**. ⚠️ `family_count` counts directions under the **≥25% rule**, the same one `p_bands` filters on — counted off raw jobs it reads 71 for Design & Creative where the next screen offers 8.

    **The write was the real defect.** Direction saves the band and the roles in ONE `save_target`, and the roles won: `targeting_write` recomputed both band columns from the title regex on every save, so the band chosen at step one was erased by the call that stored it. Now `explored_career_bands` holds the **whole explicit answer, primary first**, and only an explicit pick writes it (`chosen_bands_for_profile`). That is also what makes "nobody has been asked" (empty) readable apart from "chose exactly one band". A second target role still opens its band — derived at read time in `eligible_bands_for_profile`, where it can be removed and does not resurrect itself. **10 profiles were backfilled**; without it they would have silently lost their primary band from the feed.

    **One control, not two.** The backlog said to reuse the multi-select in `filters-sheet.tsx`; there wasn't one — three "Also explore X" switches around a derived primary, the only band UI in the app, encoding the model this replaces. `components/target-role/band-choice.tsx` is now shared by Direction, the filters sheet and Settings (`BandSettings`, beside Target Roles), and `primaryCareerBand` is gone from the sheet, the jobs tab, the mobile surface and the market page. Verified at 375 and desktop in both themes against fixed data; **the step itself has never been driven authed** — the QA account stalls at `awaiting_skill_confirmation`, before Direction.

    **OPEN — S6 Direction opens ANSWERED, five confirmations (locked with Shivam 2026-09-24, not built).** S3 made the band step pre-answered; the other four steps are not, and the landing rule still puts a fully pre-answerable person on step 1 of 5. Measured over the 27 people who have reached Direction: Field 27/27 pre-answerable, **Work 14/27**, Level 24/27, **Where 0/27 offered** (it opens as an empty picker with "Skip for now"), Name 27/27. 5 of 27 left with no target. Shraddha Gupta (`fc2f8f61-…`) is the worked example: every step pre-answerable, bounced Confirm↔Direction four times in 10 seconds, left, never returned — 0 matches to this day.

    Shape, decided: keep the five screens and make each a **one-tap confirmation** (Reddit/Pinterest pattern — every tap is Myro showing it knows them), not one summary screen behind a single tap. (a) **Work proposes the first DEFENSIBLE family in the top 5**, not only rank 1 — same `mayPropose` rule (non-catch-all AND the user holds one of its top skills), which takes it **14/27 → 27/27**; re-arm the proposal when the band-scoped list arrives, which also closes the `proposedRef` burn (the ref is spent on the band-LESS first response, and 13 of 27 get a catch-all there). (b) **Where opens on "Anywhere in India" as a stated answer**, with the CV city as the first chip labelled from the CV — never pre-selected, because location is a HARD filter on the match pool and a reflex tap must not shrink it (Shraddha studied in Kolkata and will relocate anywhere). (c) no false "could not save" after a save that succeeded — four things run after `saveTarget` inside the same `try`. ⚠️ **`target-confirm.tsx` is being actively worked by another agent** (`5d31bf83` added `withRealPrimary` and removed the `no_families` reasonCode); coordinate before starting.

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

41. **Perceived-speed contract — login critical path + CV FOUC (GRILL-LOCKED 2026-07-21, mostly NOT built).** Trigger: Rishabh Guha "credentials not shown after login" (20 Jul ~18:41 IST) → diagnosed as prod read-latency, not auth (Tier-1 #3 above has the evidence). Root problem: **login fires ~25 requests where ~4 would do**, they queue, and the app sits on 5–6s blank loading states. Shivam: *"speed visible to users is the core philosophy we started with and it is not implemented."*

    **LOCKED CONTRACT (grill 2026-07-21, 4 decisions):** **(L1) First paint = identity + score + feed.** Nav (name/avatar/coins) + Myro Score + the feed's first rows. `/home/bootstrap` already covers identity+score in ONE call; feed is why they came. Everything else defers. Target ~4 critical requests. **(L2) Returning user = stale-while-revalidate WITH a visible refreshing hint** — paint last session's cached name/score/coins instantly (<300ms, LinkedIn pattern), refetch in background, and show a subtle indicator while refreshing so a changing number is explained, never a surprise. **(L3) DEFER off the critical path** (Shivam-selected): market analytics + heatmap (incl. the 25s `/jobs/analytics`), the 4 onboarding widgets (`checklist`/`state`/`result`/`role-readiness`), and skill-demand + `/scores/map` + `/users/me/following`. **NOT deferred — Agent Picks band stays** (deliberately not selected; it's part of the feed's value). **(L4) CV route shows a skeleton of the REAL CV layout** (`CVPlaygroundSkeleton` already exists) — the flash is a bug to root-cause, not a spec change.

    **AUDIT FINDINGS (measured from his session, do NOT re-derive):** `/home/bootstrap` is a correct BFF — bundles 8 sections server-side AND seeds all 8 react-query keys; `MissionHeroRail`'s leaf queries are properly gated on `settled`, so they do NOT race it. ⚠️ **Two earlier claims were WRONG and are corrected here:** (a) there is NO 3× `users.me` — `dataKeys.profile()` IS `["profile"]`, so shell + market always shared one cache entry and the log shows it firing once; (b) the `/companies/{name}` 404s are correct behaviour (reviews empty-state, `application_reviews` has 1 row), slow only because the whole backend was queuing. **The real residual dedup gap is small and already documented in `use-home-bootstrap.ts`'s docstring**: shell `useShellModel` (`users.me`) and nav `ScoreChip` (`scores.me`) fire UNGATED because they mount on every authed page and must not couple to a home-only BFF — ~2 extra light calls, NOT the cause of the 5–6s. **The dominant cost is the L3 deferral list**: `/jobs/analytics` 22–25s · `/jobs/analytics/me` ×3 (one per target role, `chipCountQueries` in market/page.tsx) · `/jobs/my-skills/demand` 3.5–9s · `/onboarding/role-readiness` 5.8–19.5s · `/scores/map` + `/users/me/following` ~5.2s each.

    **DONE:** `3b9a16a5` market page uses canonical `dataKeys.profile()` for query + invalidation (hygiene — two spellings of one key is how a BFF seed silently misses its consumer; NOT a behaviour fix).

    **⚠️ L3 REFINED 2026-07-21 → THREE WAVES (Shivam).** Shivam's question: *"shouldn't the deferred analytics/heatmap fire right after the other loading completes, rather than waiting for intent?"* Half-right, and the correction matters: **a cascade moves server load, it does not reduce it.** Rishabh's failure was ~25 requests saturating ONE backend's pool — firing the same set two seconds later re-forms the same queue under concurrent logins, and most users never open the heatmap, so it is paid-for waste. So tier by **likelihood-of-use × cost**, not by timing alone: **WAVE 1 (immediate, critical):** identity + score + feed + Agent Picks band — nothing else. **WAVE 2 (auto-cascade — Shivam's idea, correct for this tier):** fires on idle AFTER wave 1 settles, via `requestIdleCallback`/after-paint (NOT a bare `useEffect`), low-priority and cancellable on navigate so it can never compete with wave 1 for main-thread or connection slots — `/scores/map`, `/users/me/following`, `/jobs/my-skills/demand` (cheap + likely used → ready before the user scrolls, no later spinner). **WAVE 3 (on-intent ONLY, never speculative):** `/jobs/analytics` (**22–25s**), the heatmap, `chipCountQueries` (`/jobs/analytics/me`, one per target role), the 4 onboarding widgets. **HARD RULE: a 25-second aggregation must never fire on login** — it is the single biggest contributor to the saturation that made a real user's session read as broken; only a user who actually asked for it pays for it. **Success test: login triggers `/jobs/analytics` ZERO times.**

    **✅ BUILT + pushed Develop 2026-07-21 (3 commits `a319255c`+`9d56d2e7`+`d1e57704`; Part 4 = numbers-backed recommendation, no code).** (1) **✅ L3 three-wave loading** (`a319255c`) — new `lib/hooks/use-load-waves.ts` (`useIdleWave` = wave-2 idle cascade after bootstrap settles, cancels on navigate; `useIntentWave` = wave-3 arm on first scroll/pointer/key). Wave 1 (BFF bootstrap + feed + Agent Picks) unchanged. Wave 2 = `/scores/map` (SkillMapCard render-gated) + `/users/me/following` (`useFollowCompany({enabled})`). Wave 3 = `/jobs/analytics` (movers via `useMarketIntel(..., enabled)` threaded through jobs-tab + market-rail; `loading` stays false when disabled → no eternal skeleton) + `/jobs/analytics/me` chip counts. **Measured:** cold /market login dropped from ~14-16 eager requests to ~4-6; **`/jobs/analytics` fires ZERO times on login** (the success test — it only fires on the user's first interaction). The 4 onboarding widgets + heatmap were already OFF /market (mount on /collections + /onboarding + /intel, not the login landing) — no change needed there. (2) **✅ L2 SWR + refreshing hint** (`9d56d2e7`) — new `lib/identity-cache.ts`; profile (nav name, in `use-shell-model`) + score (`ScoreChip`) seed React-Query `initialData` from a per-user localStorage snapshot with the OLD timestamp → paint <300ms AND still revalidate. Score-chip ring breathes while `isFetching` (reduced-motion → dimmed). Coins already did this via zustand-persist. (3) **✅ L4 CV FOUC — root-caused with evidence, fixed (NOT a code-split)** (`d1e57704`). Evidence: `cv-builder.css` compiles to a **79KB route-scoped chunk** (`a7a4…css`) mapped ONLY to the 5 `/cv` routes, **absent from every other page** (landing = 11 stylesheets, no CV chunk; after soft-nav = 14 incl. it). Hard-load = blocking `<link>` in head (no flash); the flash is soft client-nav ONLY — the playground (`cvb-*`) painting before the 79KB chunk finishes downloading. **The `loading.tsx` skeleton is inline-styled and was NEVER the source.** Fix = import the 4 CV stylesheets in `loading.tsx` so Next binds them to the loading boundary (build manifest confirms `/(authed)/cv/loading` went 0→4 css incl. the 79KB chunk) → downloads in parallel with page JS/RSC, ready before paint. One deduped chunk, ~1 RTT earlier, no CSS rewrite. (4) **Backend dedup/capacity — RECOMMENDATION (Shivam's scaling call, NOT built):** live prod metrics 6h = **CPU avg 0.2% / max 7.6%, mem avg 0.49GB** → near-idle. Rishabh's saturation was **blocked-slot / connection starvation** (sync Supabase reads parking on the anyio threadpool = low CPU + high latency), NOT compute. Ceiling = **1 uvicorn worker (no `--workers`) × Starlette default 40-token threadpool × 1 replica**, each sync read holding a slot up to 8s (`_POSTGREST_TIMEOUT_SECONDS`). Part 1 removed ~10 synchronized requests/login → far fewer concurrent blocked slots during a login burst. Residual risk = the `/companies/{name}` browsing-burst path (unchanged by #41 — it's browsing, not login) + bootstrap's internal 8-thread executor. **Cheapest highest-leverage lever given near-idle CPU: raise the anyio threadpool tokens (40→~100-200) + the postgrest/httpx pool** — matches the low-CPU/high-latency starvation signature; a 2nd replica mostly duplicates slots at higher infra cost when compute isn't the constraint. Making the hot sync reads async is the proper (bigger) fix. ⚠️ open uncertainty for Shivam: the **Supabase pooler connection limit** may be the true upstream ceiling — check before raising app-side pools. **OWED (Shivam):** (a) **prod = `main` merge** (all 3 commits; dev rides Develop); (b) **authed browser QA light+dark+375px** — the ONE thing not verifiable here (no test-account password; sandbox verified public surfaces render styled + soft-nav CSS mechanism + build manifest, not a real authed login's request waterfall): confirm login fires `/jobs/analytics` 0×, movers/chips appear on first scroll, score chip paints instantly + breathes while refreshing, and the CV playground has no unstyled flash on soft-nav over a throttled mobile connection; (c) the Part-4 capacity levers.

---

## PREPARE

**#45 The evidence bank — give the horizontal loop a surface.** *Design:
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

**CS-12 · promoting the gap loop out of prep rooms** — a product call, not a
coding task. Answering a gap is a working front door to the reservoir; where the
ask lives (Market, Collections, the CV page) has real cost either way.

---

## GATES — not a step

- **#16 DB capacity — Shivam: Supabase Pro + Small compute** (decided
  2026-09-30 for 2026-10-01; still Nano on 2026-10-02, DB 1,706 MB against the
  Free plan's 500 MB read-only line). Then rerun `market_arrival`: backend p95
  < 500 ms, zero failures. Next latency target: `/users/me`, p95 2.75–4.2 s. An
  unidentified ceiling sits at exactly 30,000 ms. `route.latency` and
  `route_perf_events` are not yet verified against live traffic. History: ARCHIVE
  2026-10-02 · `ARCHITECTURE_READ_PATH.md` §19.
- **Prod deploy guard — Shivam.** `main` already holds `ea165951`. Confirm
  `curl https://api.himyro.com/health/ready` answers `ready`; then
  `railway variables -s mirror-backend-prod --set PORT=8000`; wait for green;
  then `railway api 'mutation($s: String!, $e: String!) { serviceInstanceUpdate(serviceId: $s, environmentId: $e, input: { healthcheckPath: "/health/ready" }) }' --raw-var s=6f9d873b-0efb-4b30-acc6-dfcfc35d44f0 --raw-var e=f6a22e25-8218-48be-8d89-d380dfbada25`
  and read `Healthcheck succeeded!` on a FRESH deploy. Never the path without the
  port — it broke dev for 14 h on 2026-09-28. Agents are refused prod config.

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

---

## AUTHED QA CHECKLIST — the CV machine (from the beta ledger, 2026-09-30)

The 113 cohort reports (June–July) were tagged by loop step and the cohort rows
deleted (Shivam). Only what touches the machine — upload, tailor, download,
apply — survives here, as checks. A check that fails becomes a fresh item with
evidence; one that passes is struck. Report ids point into
`docs/beta-testing/closure-ledger/beta-feedback-closure-ledger.jsonl` (git).

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
  19 21 27 34 39 41 58 59 79 85 87 89 92 102 106 107 136
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

- Supabase Pro + Small (above) · the prod deploy guard (above).
- Golden list: confirm batch 1 — Rishabh Guha, Adarsh Mohan, Raj Kishore,
  Deveshwar Kashyap — then an agent stamps `golden_list_since`.
- Yes / no: drop the empty `job_switch_plans` + `job_switch_plan_reviews` (#56 M4).
- GitHub secrets `MYRO_SMOKE_EMAIL` / `_PASSWORD` / `_API_URL` — the phone render
  gate and `qa:mobile` in CI.
- Send (agent drafts): the 4 users hit by the CV-upload silent failures;
  `094122@fsm.ac.in`, stuck without a target by the five-city 422 (fixed
  `f3f0d0be`); after #56 S1+S3, the 5 Myrology opt-ins get the fixed page.
- Your own phone, 15 minutes on the front door once #57 ships (#42).
- Yours or real? `kslk37143`, `zoom8cloud`, `abibi9167`, `p9212530`, `yaya007500`
  — named ones get `is_test_account`.
- #56 §7: Razorpay webhook events, the live key on Vercel, reviewer name + email.

## AGENT CHORES — approved, small

- After `main` carries `17b5533d`: drop `company_pulse_snapshot.last_seen_at`
  (Shivam: standing yes, 2026-10-07). First confirm `main`'s
  `repositories/company_signals.py` select no longer names it — prod's pulse
  read fails, every card "—", if it still does. No refresh writes it since
  `20261006090000`; rebuildable from `jobs`.
- Delete `backend/scripts/recompute_banded_scores.py` — rescoring every user while
  they are away is a backfill (Shivam: kill).
- Delete comments (0 ever; public company pages only) and the private-notes code
  left behind when its screen went in `0b1b9b16` — keep the table and its one
  real note. **Keep** `/recruiters`, `/referrals` and their workspaces: public B2B
  doors with no backend (Shivam, 2026-10-02).
- After Pro: re-measure the anyio threadpool and pool levers.
- After the next prod deploy: five warm `x-process-time` samples of `/jobs/feed-state`, `/jobs/at/{c}`, `/companies/{c}/jobs`, confirm-skills; a week of `route.latency` for `/partner/v1/sso/session`.
- Then run the authed QA checklist.

## COMPANY OBLIGATIONS — off the working backlog

17. **Legal hardening for 10k scale (DOCS DONE 2026-06-02, counsel sign-off open):** Entity now = **Myro Career Intelligence Private Limited** (renamed across terms/privacy). Payment T&C shipped on both money surfaces (XP billing modal + Myrology checkout carry Terms+Privacy consent line). Terms §07 **Payments, XP & Refunds** (XP = closed-loop credit, not RBI PPI; funds servers not jobs; Myro = distributor of company listings; **Cancellation & Refunds** — XP final, Myrology full-refund-before-delivery / non-refundable-after). India-compliance pass INTEGRATED via Legal Compliance Checker agent: **DPDP consent microcopy at signup** (`signup-form.tsx`), privacy §06 rights expanded (withdraw/nominate/erase), §03 purpose-limitation, §04 cross-border-transfer, §07 cookie-banner-not-required note, NEW privacy §11 **Grievance Redressal** (24h ack / 15-day SLA, IT Rules 2021), terms §08 operator/grievance disclosure, §10 fraud/gross-negligence carve-out, footer "Cancellation & Refunds"→/terms#payments (Razorpay live-key prereq). Razorpay is **LIVE** — prod backend (`mirror-backend-prod`) env `RAZORPAY_KEY_ID=rzp_live_SuJDCjSGSSkGAP` + secret, tested by Shivam 2026-06-03. Billing badge is key-derived → auto-shows "Secure checkout" (no test-mode warning) on prod. ⚠️ **Verify the matching frontend public key:** Vercel **production** env `NEXT_PUBLIC_RAZORPAY_KEY_ID` must = `rzp_live_…` (same pair as backend) or checkout signature mismatches. Dev backend has no Razorpay key (payments untestable on pre-prod unless test keys added). tsc/lint clean, pushed to `main`. Files: `frontend/app/terms/page.tsx`, `frontend/app/privacy/page.tsx` (+ `privacy-components.tsx`), `frontend/components/settings-modal.tsx`, `frontend/app/myrology/checkout.tsx` (+ `myrology.css`), `frontend/components/auth/signup-form.tsx`, `frontend/components/public/public-footer.tsx`. Memory: `project_payment_legal_terms`. **OPEN — NEEDS SHIVAM + COUNSEL (placeholders live in code, NOT autonomous):** (a) lawyer review of both docs; (b) **CIN number** → `[to be inserted]` in terms §08; (c) **named Grievance Officer** — section shows designation+`grievance@himyro.com` only, IT Rules want a named individual; confirm the `grievance@himyro.com` mailbox exists + is monitored (24h/15-day SLA is now a public commitment); (d) full registered office address (street+PIN, MCA record); (e) confirm Myro is **not** a Significant Data Fiduciary (so no statutory DPO; "Grievance Officer" label correct); (f) sign off INR 5,000 liability cap; (g) confirm Myrology refund mechanics match booking flow + final price (₹499 vs ₹200-300 intro); (h) EU/UK in-scope check (cookie note assumes auth-only cookies). Razorpay live-key activation needs Terms+Privacy+Refund pages visibly linked (done).
Add: DPDP — confirm the golden-list digest is a service message; GST invoicing
for a ₹199 digital sale; a Terms §07 refund line for the Apply Pack.

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
`semantic_candidates.py` was called missing; it lives at
`backend/app/services/matching/`. Verify in code before building
([[feedback_verify_backlog_stale]]).

**Stale instructions to destroy something.** 3c told the next agent to drop four
indexes "that only serve the old deployed query". Measured 2026-09-15: all four
carry live scans. Acting on that line would have removed working indexes from the
biggest table on the instance whose capacity is #16's launch blocker. A tracker
line is a claim, not a work order — and the more destructive it is, the more it
owes you a measurement.
