# True Yodha — TASKS.md

Open task list. Add new items at the top of the relevant section. Move to "Done" when shipped, with a date.

---

## 🔥 Active

### Analytics requests

- [ ] **India-only job count** — surface the count of India-located jobs in the dataset (currently 9,446 active rows in Supabase; ~28K after Phase 3 upload). Needed for Issue 002 and every future Monday Heatmap. Acceptance: a one-line query that returns total India jobs + breakdown by city (Bengaluru, Hyderabad, Pune, Chennai, Mumbai, Delhi/NCR, Noida, Gurugram, Other). Surface in `dashboard5_location_scraper.html` as a top-level KPI card. _Requested: 2026-05-05._

### Newsletter

- [ ] **Issue 002 — distribution** — once drafts are reviewed: schedule LinkedIn posts on @himyro page, X posts on @himyro handle, Substack issues on himyro.substack, MDX issue on himyro.com. _Drafted: 2026-05-05._
- [ ] **Build Myro brand social accounts** — Issue 001 underperformed on @shivampathak personal LinkedIn (10 likes, 22 Substack views, 0 signups). Move all distribution to Myro-branded accounts: LinkedIn Page, X handle, Substack publication. Personal account stops being the publishing surface. _Decided: 2026-05-05._

### From CLAUDE.md backlog

- [ ] **Smoke test steps 4–10** — tracker → save job → diary → Next Mission card → mark complete → score recompute loop, with a dedicated test account.
- [ ] **cv_parser.py + diary_processor → LLMProvider** — migrate raw API calls to the unified `LLMProvider.complete()` fallback chain.
- [ ] **Phase 4 cross-repo taxonomy contract** — checksum check + contract test for `lightcast_skills_taxonomy.json` shared across Myro and firecrawl_Supabase.
- [ ] **Drop `jobs.main_skills` / `jobs.side_skills`** — only after one full scraper run confirms direct writes to `job_skills`.

---

## ⏸ Holding

- [ ] **Bug 3 — Settings modal redesign** — design prompt to be drafted in `docs/SETTINGS_MODAL_REDESIGN_PROMPT.md`, then handed to Claude design agent.

---

## ✅ Done

- [x] **Bug 1 — Profile auto-provisioning** — `_ensure_profile_provisioned` in deps.py, `update_profile` UPSERTs, `ensure_profile_exists` added. _2026-05-05._
- [x] **GA4 removal** — client script/config removed in the 2026-07-25 personal-data audit; `trackEvent` is now inert unless a future consented sink is added.
- [x] **ARCH SPRINT A1–A6** — DB indexes, DB-side skill filter, analytics cache, scoped match fetch, dedup `_group_job_skills`, pagination + combined-filter tests. 209 tests passing. _2026-05-05._
