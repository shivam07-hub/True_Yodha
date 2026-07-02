# Myro Beta Feedback Synthesis — 2026-07-02

**Owner:** Shivam · **Analyst pass:** Claude
**Two questions this report answers:**
1. What does the **2nd-July cohort** (Internshala interns + in-app) tell us, and **what is the "Wow" fix** for each problem they picked up?
2. Of the problems we said we **closed on 22-June**, **how many are actually closed** — in prod, and felt by users?

**Sources**
- `User_Feedbacks/Myro feedback 2nd july/` — 17 assignment files (docx + pdf); ~13–14 unique submissions after dedup (`Assignment .docx`/`Assignment (1).docx` = same user *ujala*; `Myro Assignment.pdf`/`(1).pdf` = same skill-edit user; `Shivam Pathak.docx` describes a generic "manage tasks with AI" product → wrong-product, **excluded**).
- `user_feedback` table rows **#76–#97** (22 rows, dated **23–25 June**; several are the same interns' in-app submissions as the docs → treated as one signal, not double-counted).
- Baseline: `reports/2026-06-23-feedback-synthesis.md`.

> **Note on dates:** the "2nd July" folder is when the files were *collected*; the writing/testing happened **23–25 June**, i.e. **around or just after** most of our June fixes merged to `main`. That timing matters for Question 2 — several users tested a build that did (or barely) have the fix.

---

## Part 0 — Signal quality: original vs AI-drafted

Shivam's instinct is right: separate the two, but **read both**.

**Original / high-signal** (typos, concrete bugs, personal voice, exact device/step detail) — weight these most:
- **#77** — "Fresher" filter *resets every time I open a job and press back" (exact, reproducible bug).
- **#89** — typing in the **location field, characters disappear** (concrete input bug).
- **#96** — onboarding **experience-level radio buttons are non-clickable** (hidden via CSS) → hard gate before any value (technical intern, real bug).
- **#84** — location filter returns jobs from other cities + slow load.
- **#95** — "I got **10 · Building Foundation**… couldn't understand why or which section mattered" (raw, personal).
- **Harsh (internship-2.pdf)** — scored **10/100**, then shown **VP / Associate** jobs.
- **#97** (journalism student) — "cv uploading is the biggest problem, took 1–2 min."
- **#76** — upload "**Load Failed**" after a long wait (typos "tej division", authentic).
- **Drishti (myro_assignment.pdf)** — "multiple entry points, no path that says *start here*"; proposes a 3-question router.
- **ujala (Assignment.docx)** — parser **misreads multi-column layout, mixes dates with descriptions**.

**AI-drafted but still valid** (polished structure, consultant vocabulary — the *ask* is real, discount the prose not the point):
- **novelist (myro_assignment_submission.pdf)** — "asynchronous parsing fallback / 15-sec timeout" — underneath it is a **real bug**: `/cv-tailor` **infinite spinner** on a multi-column PDF, no error, no fallback.
- **Final_Approved.pdf** — "Quick Insights Dashboard"; **Untitled/Shanvi.pdf** — "Start Here, top-3 by impact"; **Myro Internship (1).pdf** — "score breakdown + roadmap"; **Myro Internship Feedback.docx** — "Why This Job Matches You". These are four independent, polished restatements of the **exact same two asks: (a) tell me the next step, (b) explain the score.**

**Takeaway:** whether a user hand-wrote it or asked an LLM to format it, the cohort converges on the same four words Shivam already named — **simple, direct, transparent, "what next".**

---

## Part 1 — What the July cohort said (theme frequency)

Counting unique submissions (docs + rows, de-duplicated). ~30 distinct voices.

| # | Theme | Rough count | Representative voices |
|---|---|---|---|
| **A** | **Dead-end after the score — "what do I do next?"** | **~18 (dominant)** | #85, #87, #88, #89, #92, #95, #96, #79, Krishna, Myro Assignment.docx, Drishti, Shanvi, Final_Approved, 1.docx |
| **B** | **Score is opaque** — why this number, what moves it most | ~7 | #95, #91, #96, Myro Internship(1), Shanvi, Harsh |
| **C** | **Upload/parse slow or fails** — Load Failed, 1–2 min, infinite spinner | ~7 | #76, #97, #84, #86, novelist (`/cv-tailor`), Final_Approved |
| **D** | **Tailoring/skills feel generic, not personalized to JD** | ~7 | #90, #79, #88, #94, #81, Internship Assignment.docx, 1.docx |
| **E** | **Job relevance / career-stage** — senior roles to freshers, filters wrong/reset | ~6 | Harsh (10/100→VP), #77 (fresher filter reset), #84 (location), Myro Internship Feedback |
| **F** | **Parser accuracy + can't edit extracted data** — multi-column misread, skills not editable | ~4 | ujala, #81/Myro Assignment.pdf, #89 |
| **G** | **Onboarding / "multiple entry points, looks complex"** | ~6 | Drishti, #79, #96, Krishna, #85 |
| **H** | **Apply redirects to external site + forces account** | ~2 | Myro Feedback.pdf |

**Preserve (loved — do NOT regress):** CV analysis + Myro Score + **10-domain breakdown** (near-universal) · ATS-friendly resume / CV Playground · **live scraping of company career portals** (#97: "never change this — your greatest advantage") · **skill-gap → Forge bridge** (#96: "Practice it in Forge… turns a rejection signal into a learning path") · L1–L5 skill audit (Harsh) · clean black+teal UI · no-signup instant scoring.

---

## Part 2 — The "Wow" for each problem

For each theme: the friction → the **moment that flips it to delight**. Wow = the smallest change that makes the user *feel* the value, not just receive it.

### A. "What do I do next?" — **the #1 Wow to win**
- **Friction:** score lands, user "just sits there," explores tabs by themselves, some leave.
- **We already built** `NextBestSteps` (on `/home`) — but this cohort *still* overwhelmingly hits the dead-end. The panel isn't landing where/when the user needs it: **the confusion peaks on the score screen itself (`/forge` Audit / CV analysis), not on the home rail.**
- **Wow:** the instant the score renders, show **one hero card, three ranked moves** — *"1. Add ‘X’ → +N pts (Forge)  2. Fix your Summary → +N pts (CV)  3. Apply to ‘Y’ — 82% fit."* Each is a button, not a link. No tab-hunting. One user literally drew this ("Start Here, top-3 by impact"). **Make the score screen end in an action, every time.**

### B. Score is opaque — **transparency = trust**
- **Friction:** "10 · Building Foundation" with no *why* → users distrust and leave (#95, #91).
- **We built** `score-breakdown` — but it lives on a secondary Audit tab and the point-gain deltas need a recompute to light up.
- **Wow:** tap the ring → **"Your 10 = the average of the 3 domains your CV proves; 7 are uncounted"** + the single biggest lever inline (*"Prove ‘Growth’ → +12"*). Credit-score-style. Users must be able to say *"I know exactly why, and exactly what raises it."* Surface it **on the score, not one tab away.**

### C. Upload/parse slow or fails — **speed is positioning**
- **Friction:** Load Failed (#76), 1–2 min waits (#97), **`/cv-tailor` infinite spinner with no error** (novelist).
- **We built** resumable upload + `/upload/finalize` + a progress component (all on prod) — that fixes **reliability**, but the cohort's pain is now **felt speed + the *tailoring* parse path** (a different route the resilience fix doesn't cover) and **no timeout/fallback on a stuck spinner.**
- **Wow:** never a blank spinner. **Staged, honest progress** ("extracting → scoring → done") that finishes in seconds; on any stall, a **hard 15-sec timeout → "paste your text instead" fallback** so the funnel never dead-ends. Target the Google-Drive *feel*, and extend the guard to `/cv-tailor`.

### D & F. Generic output + un-editable extraction — **correctness the user can steer**
- **Friction:** "tailoring gave generic tips, not JD-specific rewrites" (#90); "skills not fully extracted **and I can't edit them**" (#81); multi-column misread (ujala).
- **Wow:** (1) **JD-grounded rewrites** — Before→After bullets that cite the pasted JD ("added ‘multi-channel’ because the JD asks for it"). Per-bullet rewrite exists; it goes generic because the **RAG playbook isn't published yet** — publishing it is the unlock. (2) **Editable extracted skills/profile** — one tap to add/remove a skill or fix a misread field, and the score/matches **recompute live**. The Wow is *"it read me wrong, I fixed it in 2 seconds, everything updated."*

### E. Job relevance / career-stage — **don't insult the fresher**
- **Friction:** 10/100 undergrad shown **VP/Associate** roles (Harsh); freshers want entry-level first.
- **Wow:** **career-stage as a hard prior** — interns/freshers see internships & entry-level *first*, seniors gated below. A fresher should think *"these are for me,"* not *"this isn't built for me."* Plus filters that **stick** (fix #77 reset) and **work** (fix #84 location).

### G. Onboarding / too many doors — **one guided path in**
- **Friction:** "CV Hub, Skills, Jobs — no path that says start here" (Drishti); onboarding radio gate literally unclickable (#96).
- **Wow:** a **3-question router** ("current status / target role / biggest blocker") that drops the user **straight into the one right feature** — blocked-on-skills → Forge, ready CV → Jobs. First and hardest: **fix the onboarding radio bug (#96)** — it's a hard gate to *any* value.

### H. Apply redirect — **set the expectation before the click**
- **Wow:** label it — *"Apply on company site ↗ (may need a free account)"* — before redirect, so it reads as honest, not a bait-and-switch. (Dead-button fallback already shipped; this is the redirect-expectation copy.)

---

## Part 3 — Question 2: how many of the 22-June fixes are **actually closed?**

Method: for each June "act-now / investigate" item, verify (a) code exists, (b) it is on **`origin/main` = prod (himyro.com)**, (c) the July cohort shows it's **felt** resolved.
`origin/main` is only **4 commits behind `origin/Develop`** → prod ≈ Develop; nearly everything merged.

| June item | Code on prod (`main`)? | Felt-closed by July cohort? | Verdict |
|---|---|---|---|
| **T2-2 Editable target role** (`target-role-editor`, commit `#145`, 06-23) | ✅ yes | ✅ **zero July complaints about a fixed/wrong role** | **FULLY CLOSED** |
| **T1-5 Apply dead-button → ApplyRow fallback** (`fe158e8`) | ✅ yes | ✅ (only the *external-redirect* copy remains, theme H — different issue) | **CLOSED** |
| **Matches-500 for fresh-CV users** (`e79888d` + `27229a5`) | ✅ yes | ✅ no 500 reports this cohort | **CLOSED** |
| **T2-1 Next-3-steps panel** (`NextBestSteps` on `/home`) | ✅ yes | ❌ **~18 users still hit the dead-end** | **Shipped, NOT felt** — wrong placement (home, not score screen) |
| **T2-3 Score breakdown + "+N pts"** (`score-breakdown` on `/forge` Audit; `0aaa88a`,`80ad4f3`) | ✅ yes | ❌ users still "don't know why my score" | **Shipped, NOT felt** — on a 2nd tab; deltas need a recompute |
| **T3-1 Matched/missing skill chips** (`HeroCard`, ungated) | ✅ yes | ⚠️ partial — needs a **match recompute** to populate; some still see generic | **Shipped, partially felt** |
| **T3-4 Per-bullet Mentor Rewrite** (`cv_rewrite`, `bullet-rewrite`) | ✅ yes | ❌ #90 still "generic, not JD-specific" | **Shipped, NOT felt** — RAG playbook **not published** yet (#32, one step left) |
| **T1-1 / BUG-2 Upload resilience + progress** (resumable + `/upload/finalize` + progress; bucket applied to prod) | ✅ yes | ❌ #76/#97 still Load-Failed/slow; novelist infinite spinner on `/cv-tailor` | **Shipped, NOT felt** — fixes reliability not felt-speed; `/cv-tailor` path uncovered; some users pre-dated deploy |
| **T1-3 Market filter selectors** (#23 rework) | ✅ yes | ❌ **new** filter bugs: #77 fresher-reset, #84 location-wrong, #89 location-input | **Reopened** — different bugs, same surface |
| **T3-2 Role-conditioned skill/job relevance** | ⚠️ partial | ❌ Harsh: 10/100 → VP jobs | **OPEN** — career-stage weighting not done |
| **T2-4 Restructure silent edits / destructive "X"** | — | not retested | Open (no new signal) |
| **T2-5 Job-specific readiness** (`analyse.py` exists) | ✅ code | not clearly retested | Likely-closed, unverified by cohort |

### Count
- **Code merged to prod:** ~**10 of 12** June items have their fix on `origin/main`. Engineering did ship.
- **Actually closed *and felt* by users:** **3** clean — **editable role, apply-fallback, matches-500.**
- **"Shipped but not felt" (the important bucket):** **5** — next-step panel, score breakdown, skill chips, per-bullet rewrite, upload resilience. The code is live; the user still hits the wall because the fix is **on the wrong screen, behind a recompute, or solves reliability instead of the felt problem.**
- **Reopened / still open:** filters (new bugs), career-stage relevance.

### The one sentence for Shivam
> We **merged ~10 of 12** June fixes to prod, but the July cohort proves only **3** are actually *felt* closed. The rest are **"shipped, not felt"** — right fix, wrong placement/gating. **The next round isn't new features; it's moving the fixes we already built onto the screen where the pain happens (the score screen), lighting them up (run the recompute; publish the RAG playbook), and killing the small bugs that reopened filters/onboarding.**

---

## Part 4 — Recommended priority order (grounded in both parts)

1. **End the score screen in an action** — move `NextBestSteps` + `score-breakdown` onto the CV-analysis/Audit screen itself, as one "Start Here: top-3 by impact" hero. Closes Theme A + B, the dominant asks. *(Reuse built components — placement change, not new build.)*
2. **Run the score + match recompute** so "+N pts" deltas and matched/missing chips actually populate. *(Ops step — lights up already-shipped T2-3/T3-1.)*
3. **Publish the RAG playbook** (#32, one step left) → rewrites go JD-specific → closes Theme D generic-tips.
4. **Career-stage prior** on job matching (interns → internships first) → closes Theme E + the Harsh "VP-to-fresher" trust-killer.
5. **Upload/tailor never dead-ends** — staged progress + 15-sec timeout→paste-text fallback, extend to `/cv-tailor`. Closes Theme C.
6. **Small bugs that reopened surfaces:** onboarding radio (#96), fresher-filter reset (#77), location input vanish (#89), location filter accuracy (#84).
7. **Editable extracted skills/profile** with live recompute → closes Theme F.
8. **Apply-redirect expectation copy** → closes Theme H.

**Do not touch:** CV analysis + 10-domain score, ATS resume, live career-portal scraping, Forge skill-gap bridge, no-signup scoring.
