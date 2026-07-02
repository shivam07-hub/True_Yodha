# Myro — Action Plan for Unresolved / Repeated Feedback

**Date:** 2026-07-02 · **Owner:** Shivam · **Author:** Claude
**Companion to:** `reports/2026-07-02-feedback-synthesis.md`
**Inputs merged:** 2nd-July docs + Supabase #76–97 + **two emails** (`email_feedback_2nd_july.pages` — generic assignment = Theme A; **Vaibhav Srivastava** = Theme C, screenshot-attached). Both **merge with capture, no new theme.**

**North star for every fix below:** *simple · valuable · memorable (good).* If a fix adds a screen, a word, or a step, it's probably wrong.

---

## The one idea that fixes half the list

**The score screen must become the Command Center.**

Root cause of "shipped but not felt": we built the right pieces (`NextBestSteps`, `score-breakdown`) but mounted them on `/home` and `/skills` — **not on the CV-analysis screen where the score actually lands.** The user gets the number, then has to *go find* the guidance. That gap is the ~18-vote "what do I do next" complaint.

**Fix:** the moment the Myro Score renders, that same view shows — in order — **(1) the score + why it's that number, (2) your top-3 ranked moves as buttons, (3) one best-fit job.** No tab-hop. One screen answers "how am I doing / why / what now." This single consolidation closes Theme A + B and gives D and E a home.

Everything else is reliability and correctness so the Command Center never lies or stalls.

---

## Repeated-from-June items (fix first — users hit these twice)

### 1. Theme A — "What do I do next?" ★ dominant, repeated
- **Evidence:** ~18 July voices + Email 1 ("add a personalized action plan after the CV review"). next-step ratings 1–3 cluster here.
- **Root cause:** `NextBestSteps` is on `/home` (`frontend/app/(authed)/home/page.tsx`), invisible at the score moment.
- **Fix (whatever it takes):** mount the next-3-steps block **inside the CV-analysis / score view** as the terminal element. Each step = a button that *does* the thing (Add skill → Forge, Fix section → CV editor, Apply → job). Reuse the built component; this is a **placement + wiring** change, not a new build.
- **Wow test:** a first-run user never has to ask "now what?" — the screen ends in three tappable moves ranked by point-impact.

### 2. Theme B — Score is opaque ★ repeated
- **Evidence:** #95 ("got 10, no idea why"), #91 ("which edit moved the score?"), #96, Myro-Internship(1), Shanvi.
- **Root cause:** `score-breakdown.tsx` sits on `/skills` (`skill-intel-header`); the "+N pts" deltas need a **recompute** to populate.
- **Fix:** (a) surface the breakdown **on the score itself** (tap-ring → in-place panel: "your 10 = avg of the 3 domains your CV proves; 7 uncounted" + biggest lever inline). (b) **Ops:** run `scoring.recompute_score()` across live users so deltas + chips light up (already built, currently dark).
- **Wow test:** user can say in one sentence *why* their score is what it is, and *which one change* raises it most.

### 3. Theme C — Upload/parse slow, fails, or spins forever ★ repeated
- **Evidence:** #76 "Load Failed", #97 "1–2 min", #86 assessment didn't load, novelist `/cv-tailor` infinite spinner, **Vaibhav: "Net…" error + spinner, region/firewall-suspected.**
- **Root cause:** resumable upload + `/upload/finalize` + progress **are on prod** — they fix *reliability*, but (i) some users pre-dated deploy, (ii) the `/cv-tailor` parse path is **uncovered**, (iii) a stalled request has **no timeout/fallback**, (iv) network/region failures (Vaibhav) have no escape hatch.
- **Fix (whatever it takes):**
  - **Promote paste-text to a first-class primary** (Vaibhav's exact ask) — a "Paste your CV text" tab **beside** the dropzone on the upload surface, not a buried fallback. Backend `/cv/text` already exists; wire a prominent entry (`frontend/components/cv/...`, pattern off `ManualAddModal`).
  - **Hard 15-sec watchdog** on every parse (upload *and* `/cv-tailor`): on stall → auto-offer the paste path + a plain-language "network looks slow — try pasting" message. Never a naked spinner.
  - **Staged, honest progress** ("extracting → scoring → done") so felt-speed improves even when wall-time doesn't.
- **Wow test:** on the worst network in the worst region, the user is *never* stuck — within 15s they either see a score or a one-tap paste path. Feels like Google Drive.

### 4. Theme D — Tailoring/skills feel generic, not JD-specific ★ repeated
- **Evidence:** #90 ("generic tips, not tied to my pasted JD"), Internship Assignment.docx, #88, #79.
- **Root cause:** per-bullet Mentor Rewrite is built, but it falls back to **static XYZ rules** because the **RAG playbook isn't published** (#32 — one deploy step left; retrieval returns `[]` until then).
- **Fix:** **publish the playbook** (`backend/scripts/publish_playbook.py` on a backend with the embedding key set) → rewrites cite the specific JD/playbook passage. Then confirm the rewrite entry point is discoverable from the gap.
- **Wow test:** a rewrite reads "changed to ‘multi-channel campaigns’ **because the JD asks for it**" — concrete Before→After, not "add numbers."

### 5. Theme E — Job relevance / career-stage ★ repeated
- **Evidence:** **Harsh: scored 10/100 → shown VP/Associate roles.** #77 fresher-filter **resets on back**, #84 location filter returns wrong cities.
- **Root cause:** matcher doesn't weight **career stage** as a hard prior; two market filter state bugs reopened the surface.
- **Fix (whatever it takes):**
  - **Career-stage prior** in the matcher: intern/fresher profiles get internships + entry-level **first**, senior roles suppressed. (backend matcher — the same seam touched in the matches-500 Match Read work.)
  - **#77:** persist the feed filter across navigation (`frontend/components/market/job-feed-query-key.ts` / `jobs-tab.tsx` — filter must survive the back-button, not reset).
  - **#84:** fix location filter accuracy (city filter actually constrains results).
- **Wow test:** a fresher's first job screen reads *"these are for me,"* and any filter they set is still set when they come back.

### 6. Theme F — Can't edit mis-extracted skills/profile ★ repeated (June T4-9)
- **Evidence:** #81 / Myro-Assignment.pdf ("only prominent keywords detected; **no way to edit or refresh** the skill set"), #89 location-field input drops characters.
- **Root cause:** extraction is read-only in the UI; a wrong parse silently poisons score + matches.
- **Fix:** make the **extracted skills/profile editable** — add/remove a skill, fix a field, one tap → **score + matches recompute live** (reuse the skill-edit + recompute path already in `cv_skill_edit.py`). Fix the location input character-drop bug (#89).
- **Wow test:** *"it read me wrong, I fixed it in 2 seconds, and everything updated."*

---

## Also-open (not repeated, but close the loop)

### 7. Onboarding gate bug + too-many-doors
- **#96 (hard bug):** experience-level radio (`frontend/components/onboarding/target-step.tsx`) is **non-clickable** (hidden via CSS) → blocks reaching any value. **Fix the label→input toggle first** — it's a funnel gate.
- **Simplicity:** a **3-question router** (status / target role / blocker) that drops the user into the *one* right feature (Drishti's exact ask). Optional after the Command Center exists — but it's the "one door in."

### 8. Apply redirect expectation (Theme H)
- Label before redirect: *"Apply on company site ↗ (may need a free account)"* — design-over-words, one string. Dead-button fallback already shipped.

---

## Sequence (highest leverage first)

| # | Item | Type | Why here |
|---|---|---|---|
| 1 | **Command Center** — mount next-3-steps + score-why on the score screen (Themes A+B) | Build (mostly re-placement) | Closes the dominant ~18-vote complaint; reuses built parts |
| 2 | **Recompute** scores + matches | Ops | Lights up already-shipped deltas/chips; zero-risk |
| 3 | **Publish RAG playbook** (Theme D) | Ops/deploy | One step; makes rewrites real |
| 4 | **Upload never dead-ends** — paste-primary + 15s watchdog + staged progress (Theme C) | Build | Vaibhav + repeated; protects top of funnel |
| 5 | **Career-stage prior + filter persistence + location fix** (Theme E) | Build | Trust-killer (VP-to-fresher) + reopened bugs |
| 6 | **Editable extracted skills/profile** (Theme F) | Build | Correctness the user can steer |
| 7 | **Onboarding radio bug** (#96) + 3-Q router | Build | Funnel gate + "one door in" |
| 8 | **Apply redirect copy** (Theme H) | Copy | One-string honesty |

**Do NOT touch (loved):** CV analysis + 10-domain score, ATS resume, **live career-portal scraping**, Forge skill-gap bridge, no-signup scoring.

**Verify-before-done (per house rules):** each build item ships only when `pytest` + `tsc --noEmit` + `next lint` + `ui-drift` are green and the **Wow test** passes on a real 375px session, light + dark. Root-cause only — no symptom patches.
