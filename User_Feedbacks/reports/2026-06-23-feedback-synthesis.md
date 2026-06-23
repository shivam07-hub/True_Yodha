# Myro Beta Feedback Synthesis — 2026-06-23

**Owner:** Shivam · **Analyst pass:** Claude
**Sources:** `user_feedback` table (68 rows: 55 structured feedback + 8 bug + 2 idea + 2 praise + 1 company) · `User_Feedbacks/User suggestions_28may.md` (May cohort) · `User_Feedbacks/Myro Feedbacks 22nd june/` (~16 assignment PDFs/DOCX) · `User_Feedbacks/User_feedback_captured22ndjune.pages` (compiled 17-user doc, exported via Pages) · `reference/User feedback docs/` (May PDFs).
**Research question (per playbook):** Can a first-time job seeker reach, understand, trust, and act on a useful Myro result within 30 min on their own device?

---

## Cohort signal (structured feedback, n=54 rated)

| Rating dimension | Avg | % rating ≤2 (low) | % rating ≥4 (high) |
|---|---|---|---|
| I understood what to do next | 3.91 | 7% | 74% |
| I trusted the results | 3.80 | 11% | 72% |
| Results felt relevant | **3.76** | **13%** | 61% |
| I would return | 3.96 | 4% | 69% |
| I would recommend | 3.89 | 11% | 76% |

**Relevance is the weakest dimension** and "what do I do next" is the loudest *qualitative* theme even though its rating looks OK — users tolerate it but it caps activation. Return/recommend are healthy → the core idea lands; the friction is in trust + the action loop.

**Biggest-problem area distribution:** CV upload 15 · CV analysis/Score 15 · Jobs/matches 10 · Skills/Forge 6 · CV Hub/tailoring 3 · Tracker 2 · Landing 2 · Other 1.

**Data quality:** 2 submissions reviewed the wrong product (one explicitly describes "ChatGPT Android app" context retention — `#57`/Boisakhi) → ineligible, excluded from product signal. `#1` empty.

---

## TIER 1 — BLOCKERS (core flow breaks; ship first)

### T1-1. CV upload freezes / fails on mobile, no progress, no error
The single most-cited functional failure. "Loading wheel spins forever, page froze, no error, I closed the tab" (Assignment-1, iPhone/Safari, .docx) · 90s frozen screen, no indicator (`#75`) · "network disconnected" mid-upload (`#13`) · upload button no response (`#30`) · upload timed out + error (`#47`).
- **User impact:** upload is the whole product; a silent freeze = immediate drop-off.
- **Status vs backlog:** this is **BUG-2 / `project_cv_upload_weak_radio_resilience`** — fix is BUILT but uncommitted. **Action: commit + ship + 375px mobile QA.** Add a real progress indicator (percentage / staged "extracting → scoring") — *every* upload-area complaint also asks for this.
- Live telemetry already confirms the dominant cause: `upload_post_interrupted` on weak mobile radio (~72% of failures).

### T1-2. Scanned / image PDF rejected, no graceful path
"Could not read text in the PDF; switched to DOCX and it worked" (`#36`); May user: "no skills could be extracted." CVUP4 guard exists but the message isn't guiding users to a fix.
- **Action:** verify the 422 copy is actionable ("This looks like a scanned PDF — upload a text PDF or DOCX, or paste your CV text") + offer paste-text fallback inline.

### T1-3. Jobs feed empty + search/location selectors dead
"Multiple skills but not a single job in matched section; search tab not working; location select shows no options" (`#4`, blocker) · "no one can select the city and country" (`#14`) · "companies suggestions is blank, not working" (`#32`, /market).
- **Action:** triage `/jobs` matched-empty + `/market` filter selectors (city/country/company) not populating. Likely related to the matches-500 / filter wiring already touched in #29/#23 — confirm fixed in prod.

### T1-4. "Idea dispatch" button → "failed to fetch"
`#11` (blocker, /cv). Diary/dispatch CTA throws.
- **Action:** reproduce + fix the dispatch endpoint call; also rename "Dispatch" (jargon, see T4).

### T1-5. Apply button stuck
`#22` — "Apply click but page stuck," no form opens. Dead-link / apply-redirect path.
- **Action:** confirm apply opens `source_url` in new tab; wire the dead-link prompt (Job Intelligence work).

---

## TIER 2 — TRUST FAILURES (result reached but can't be trusted/understood)

### T2-1. ⭐ Dead-end after the score — "I don't know what to do next"
**The highest-leverage activation fix.** ~12 submissions independently asked for the *same* thing: a prioritized next-action panel right after the Myro Score.
- "After the score I genuinely didn't know where to go — Skills? Jobs? Tailor? I just sat there" (`#58`) · "complicated layout, dead-end once baseline analysis was done" (talia `#74`) · explicit asks: "Your Next 3 Steps panel" (`#58`, `#22`), "Next Best Action" (`#34`), "Recommended Next Step section" (`#59`, `#21`), "Top Resume Improvements" (`#64`), priority-ranked recommendations (`#42`, `#62`).
- **Proposed:** a **"Your next 3 steps"** module rendered immediately after score: (1) top skill gap to close → Forge, (2) best-fit job to apply → Jobs, (3) the one CV section to fix → Tailor. Ranked by score impact.
- **Status vs backlog:** `FirstRunHero` + "UNLOCKS AS YOU GO" exist (#18/PR-BASE-TOUR superseded) but are clearly **not closing this** for post-score users. The gap is a *post-score, score-specific* next-step panel, not a generic first-run hero.

### T2-2. ⭐ Target role is fixed and not editable
Whole score + job filter is measured against an auto-assigned role the user **cannot correct**. Scored 17/100 vs "Data Analyst," re-upload doesn't re-prompt, Jobs→Filters shows a static non-clickable "Data Analysis · 2042" pill (`#23`, Syed Reyan Ali PDF).
- **User impact:** a wrong role silently poisons every downstream output → pure trust-killer. "A score is only meaningful if I trust the role I'm measured against."
- **Action:** make target role editable everywhere it appears — "Edit role" on CV analysis page + editable role selector in Jobs filters. **NEW — not in current backlog. High priority.**

### T2-3. ⭐ Score is opaque — no breakdown, no "what moves it most," no benchmark
"Got a score but no idea how it's calculated or which change has the biggest impact" (`#70`, `#50`, `#28`, `#64`, `#67`, `#62`, `#42`) · "'44% one-page score' shown with no meaning" (myro.pdf) · asks for per-section contribution, prioritized recommendations, and percentile/benchmark vs successful candidates (`#50`).
- **Action:** score-explainability layer — per-domain contribution to the 0–100, the top-3 highest-impact changes (with estimated point gain), and plain-language interpretation. **NEW.**

### T2-4. AI restructure edits/removes content silently + destructive "X" with no confirm
"My CV was auto-restructured, soft-skills + descriptions removed with no explanation" (`#73`, myro.pdf) · "the 'X' in the contact field cleared content instantly, no warning" = data-loss risk (myro.pdf).
- **Action:** (a) inline justification for every restructure edit ("moved/merged/cut because…"); (b) confirm-guard on destructive clear/delete. Ties into the existing Restructure-with-Mentor honesty guards — surface the *why* in the UI.

### T2-5. "Assess my readiness for this job" is not job-specific
Tapping it on a live listing routes to the **generic** Skills/Score page with unrelated gaps, instead of comparing the CV against *that* job (`#61`).
- **Action:** make it return a job-specific readiness summary (matched skills / missing skills / match%). Feature currently doesn't do what its label promises.

---

## TIER 3 — RELEVANCE & ACTION FAILURES (lowest-rated dimension)

### T3-1. Job matches feel irrelevant; no "why this match"; "0% / no overlap" unexplained
Senior/full-time roles shown to interns (`#75`); "various incompatible jobs unrelated to CV skills" (`#40`); "0% skills / no overlap yet" with no missing-skill reasoning (Myro internship assignment PDF); want a **"Why am I seeing this job?"** panel = matched skills + missing skills + gaps + next steps (`#65`, `#62`, Myro internship PDF).
- **Action:** surface match rationale on every card (matched/missing skills) + tighten relevance ranking. Partially covered by Job Intelligence "Why you fit" — but it's XP-gated/hidden; **make the basic matched/missing-skill chips always visible.**

### T3-2. Skill-gap suggestions not conditioned on the user's domain/target role
Content writer is told to learn Machine Learning / Financial Accounting / Management Consulting (`#54`); social-media-marketing target → "Machine Learning L1" suggested (`#38`). Recommendations read as generic high-demand skills, not role-relevant.
- **Action:** filter skill-gap + next-skill suggestions by the detected/selected target role; hide off-domain paths.

### T3-3. Duplicate job listings
Identical roles appear multiple times (e.g. Accenture) lowering trust in data accuracy (`#33`). + stale postings ("posted long days back," `#60`; "no scrape-time indicator," user t).
- **Action:** dedupe in feed; surface a clean last-seen/posted freshness indicator (ties to listing_confidence work + scraper dedup in `firecrawl_Supabase`).

### T3-4. CV tailoring gives generic tips, not rewrites
"Expected it to rewrite my bullets with metrics; got 'add numbers / use action verbs'" (`#31`); wants Before→After bullet rewrite mapped to the JD (`#25`); generated CV ≈ uploaded, "didn't add value" (`#56`).
- **Status:** per-bullet Mentor Rewrite + Restructure are BUILT — but these users still perceive generic output. **Action:** verify rewrite is actually producing concrete rewritten bullets (not tips) and that the entry point is discoverable; the RAG-grounding (#32) needs the playbook published to go live.

---

## TIER 4 — USABILITY / MODERATE FRICTION

| # | Theme | Evidence | Action |
|---|---|---|---|
| T4-1 | **Job filters missing/broken** — remote/onsite/hybrid/part-time/internship/location absent; **WFH filter still returns on-site jobs** | talia `#74`, `#53`, `#56`, `#40`, `#71`, `#4`, `#14`, Myro app.pdf, `#75`/`#60` (fresher/internship) | Backlog #23 market-filter rework + **fix the work-mode filter actually filtering** (talia's #1 bug). Add internship/fresher + work-mode + location filters that work. |
| T4-2 | **Navigation overwhelming / can't find things** — "looks like coding," scattered; saved job missing from saved folder (`#46`); can't find generated tailored CVs (`#24`); sidebar clutters at 3+ versions (user t) | `#19`, `#41`, `#74`, `#46`, `#24` | IA simplification; fix saved-folder + tailored-CV discoverability (folds into #29 dashboard/CV-surface lane). |
| T4-3 | **CV upload not prominent + no onboarding** — upload buried, found by accident; repeated ask for a 3-step welcome tour | `#52`, Jahnvi PDF, `#16`, Vidhi/HiMyro-Review/Himyro.pdf PDFs | Prominent "Upload your CV" CTA on dashboard + lightweight first-run guidance. (Note: PR-BASE-TOUR was closed-superseded — but the *upload prominence* + *post-score next-step* asks remain.) |
| T4-4 | **Mobile layout** — text overflow/overlap, crowded, buttons overlap, slow loads | `#26`, MYRO ASSIGNMENT (Hindi), user t, Vidhi, HiMyro-Review | Mobile QA pass (folds into #29 + open PR-F). |
| T4-5 | **Speed** — parse 26s (`#33`), 4 min (`#55`), 2 min (`#75`), slow score (`#53`,`#26`), nav lag (`#43`) | several | Parse/score latency budget; perceived-speed via progress UI (T1-1). |
| T4-6 | **Skill assessment too narrow** — ML L1 only regression/bias/variance | `#68` | Topic-balanced question pools per domain (content-supply, `firecrawl_Supabase`). |
| T4-7 | **Hyperlinks not extracted** — embedded LinkedIn/GitHub links dropped | `#72` | Extract embedded hyperlinks during parse; show in profile. |
| T4-8 | **Special-char corruption** — "R&D", "Néstor" mangled | user t | UTF-8 parse fix (CLAUDE.md ND3/ND8) — `errors='replace'` + parser test. |
| T4-9 | **Skills missed from CV** — some experience skills not detected, no "here's what we read" view | `#46` | Show an extracted-skills/"what we read" confirmation; flag low-confidence skips. |
| T4-10 | **Score shown before parse confirmation** — want extracted details preview before final score | Myro Assignment PDF | Show parsed role/skills/experience preview before scoring; let user confirm/correct. |
| T4-11 | **Cannot DELETE a CV — only "Replace"** — no removal option | User 11 (June compiled doc) | Add a delete/remove action for uploaded CVs (not just replace). |
| T4-12 | **Post-upload profile editing glitchy on mobile, changes don't save** — can't easily correct parsed details after scan; "clunky, not saving" | User 16 (June compiled doc) | Fix parsed-detail/profile editing on mobile (clear per-section Edit + reliable save). Distinct from skill-edit flow. If profile is wrong, all downstream recs are wrong. |
| T4-13 | **"Fix with AI / Suggest phrasing" button per skill gap** — bridge identify→fix inline | User 10 (June), reinforces T3-4 | One-click rewrite/phrasing CTA next to each identified gap. |

---

## TIER 5 — MINOR / POLISH

- Onboarding track dropdown missing **Finance / Accounting** → users forced to "Other" (`#37`).
- **Username**: underscore rejected, only dash (May feature-feedback) — clarify charset inline.
- **Job descriptions**: one big unorganized paragraph, little company detail (`#40`); add structure + company info.
- **Credits/Myro Coins unclear + privacy doubt** — "not clear how credits are used / how many actions cost" (Himyro.pdf June); "Myro Coins to meter advanced features … and no privacy" (User 7, June). Ties to the "How Myro Coins Work" surface (#25 cleanup) + reinforce the in-memory/no-store privacy message at the paywall.

> **Note:** the `User_feedback_captured22ndjune.pages` doc (17 users) was read after the first synthesis and **overwhelmingly confirmed** the existing tiers — repeated independent votes for T2-1 (next-step panel: Users 1,6,14,15), T2-3 (score breakdown: Users 6,11), T3-2 (role↔skill mismatch: Users 8,9), T3-1 (job relevance: Users 13,3), T1-1 (mobile upload freeze: Users 3,12), T4-5 (Skills chart slow on Android: Users 5,17). This raises confidence on the Tier-1/2 ranking. New items surfaced: T4-11, T4-12, T4-13.
- **Theme toggle** reported broken (May user 3) — likely fixed by #28 token migration; **verify**.
- **Visual**: one user wants more vibrant colors (`#20`); another finds it too "coding"-like (`#19`). Low-priority, conflicting — leave.

---

## PRESERVE (strengths — do NOT regress)

1. **CV Score + instant analysis + domain breakdown** — by far the most-loved feature; cited as "preserve" in the majority of submissions.
2. **ATS audit checklist** — "simple, clean, easy to understand at a glance" (`#69`, `#31`, Tushya PDF).
3. **No-signup instant scoring on landing** — "expected a signup wall, it just showed me value — breath of fresh air" (Assignment-1).
4. **Privacy: processed in memory, never stored** — "made me feel safe uploading immediately" (`#58`).
5. **CV Hub multi-version concept** — resonates strongly with active job seekers (Vidhi 3.5yr marketer, HiMyro-Review).
6. **L1–L5 skill progression ladder** — "clear learning roadmap, motivating" (`#68`).
7. **Intel tab (top hiring companies)** — "clean at-a-glance view of who's hiring" (`#23`, `#15`).
8. **Jobs ↔ Forge ↔ Intel flow** — "genuinely good, build on it, don't restructure" (`#72`).
9. **Activity tracker** — "shows current activities + opportunities matching my interests, works smoothly, useful" (Anushka, `Untitled.pages`).

---

## GROWTH / GTM (separate lane — not engineering, but recorded)

- **Internshala is an untapped channel** — "I found out about you *from* Internshala when I could've been your prime customer" (`#19`). Multiple users compare to Internshala as the mental model.
- **WhatsApp match alerts** — proactive "3 new roles at Airbus match your saved Product CV @88%" (user t) — retention outside email/in-app.
- **LinkedIn organic**: "The Fallacy of the Single Master CV" angle → drives multi-version usage (user t, Vidhi).
- **Campus ambassadors / demo reels** on Instagram + LinkedIn (rohit notes) — many users "don't immediately understand the platform's value."
- **Instant "wow" before CV** — one user wants a mock interview / value in 30s with no signup (partially delivered via anon score).
- **Position as "central career workspace"**, not a resume tool — students keep CVs scattered across Drive/WhatsApp/Telegram (rohit).
- **Localized-language regional play** — user-proposed Kerala 10k-in-a-month plan: Malayalam Reels/posts, college WhatsApp-community campus ambassadors, local forums, referral network-effect, daily-optimized tracking (`User_suggested_growthStrategy.pages`). Validates a regional, vernacular, campus-led GTM motion.

---

## Decisions for Shivam (Stage 8)

**Three to act on NOW:**
1. Ship the built CV-upload mobile resilience fix + add a real progress indicator (T1-1).
2. Build the post-score **"Your next 3 steps"** panel (T2-1) — biggest activation lever, ~12 independent requests.
3. Make **target role editable** (T2-2) — silent trust-killer on the core output.

**Three to investigate:**
1. `/jobs` empty-matches + `/market` filter selectors dead (T1-3) — confirm fixed in prod or reproduce.
2. Job-match relevance + role-conditioned skill gaps (T3-1, T3-2) — relevance is the lowest-rated dimension.
3. Whether per-bullet Rewrite is actually producing rewrites vs tips, and is discoverable (T3-4).

**Three strengths to preserve:** CV Score/analysis, ATS checklist, no-signup instant scoring.

**Already-known / partially shipped:** CV-upload resilience (BUG-2, built-uncommitted), market filter rework (#23), special-char parse (ND3/ND8), Job Intelligence "why you fit", Restructure honesty guards, Myro Coins clarity (#25).

**Next review owner/date:** Shivam — after T1 ships.
