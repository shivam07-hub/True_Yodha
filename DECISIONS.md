# MYRO — Locked Decisions & Data Model

> Constraints already settled. Read the rows for the area you are touching.
> Reopening one of these needs Shivam, not a judgement call mid-task.
> Cockpit: [CLAUDE.md](CLAUDE.md)

---

## ECONOMY & PROGRESSION

Verified against code 2026-08-05. Numbers here are the contract; if code and this
disagree, code wins and this line gets fixed in the same commit.

- **Welcome grant: 3000 Myro Coins**, once, on first successful CV analysis
  (`WELCOME_XP`, idempotent). Granted by a DB trigger, never by app code — see
  XP-DB1 below.
- **Diary entry: +30 coins** (`routers/diary.py`, live).
- **Timed Forge session earning is RETIRED.** Nothing awards coins per session
  any more. `user_skills.forge_sessions_count` survives as a display counter.
  Do not design a mechanic on it — see ARCHIVE.md #11.
- **Skill levels advance on quiz clears**, not time. Thresholds
  `{L0→L1: 1, L1→L2: 3, L2→L3: 9, L3→L4: 27}` live in TWO files that must agree:
  `backend/app/services/forge_service.py:LEVEL_THRESHOLDS` and
  `frontend/lib/level-thresholds.ts`. Change one, change both.

---

## DECISIONS LOCKED

| # | Decision |
|---|---|
| OQ1 | Separate repos. Myro + firecrawl_Supabase stay independent. |
| OQ2 | Token-scoped for user endpoints. Service-role for admin/internal only. |
| OQ3 | Intentional LLM separation. Scraper = local LM Studio. Myro = cloud (OpenRouter→Groq→Gemini). |
| OQ4 | Single canonical scoring. `compute_and_persist_score()` is source of truth. |
| CVJT1 | **CV Playground + Job Tracker + LinkedIn bridge contract is locked.** One active tailored CV per exact `job_id`; deterministic matcher before AI; honest/flexible status flow; immutable submitted-CV snapshots plus application attempts; extension saves/matches/links but editing stays in CV Playground. Full contract: `memory/project_cv_playground_linkedin_tracker.md`. |
| S3 | `job_applications.status = 'pending'` means saved/targeted. Every saved job is an intended application. |
| S4 | Intel is ephemeral. Skill targets inferred from saved jobs only. No DB writes. |
| NU1 | Profile auto-provisioned from JWT email + user_metadata.full_name on first authenticated request. Admin client (bypass RLS). |
| NU2 | `update_profile` UPSERTs (defensive). |
| XP1 | **Myro Coins are permanent** — never reset. Wallet the user owns forever. (Renamed from "XP" end-to-end 2026-06-22, backlog #25/#31 — DB, RPCs, wire and UI all say coins. `XP*` row IDs kept only because other docs cite them.) |
| XP7 | Cart is ephemeral Zustand state until diary submit → snapshot as `daily_logs.cart_skills JSONB`. |
| XP9 | Company tab selection reconfigures the WHOLE Mission Control page. |
| XP10 | XP pricing modal is deferred. Pick it up only after XP fairness fixes and the single "How XP Works" modal are shipped. |
| PV1 | **Privacy-first identity.** Myro collects minimum data — only email + password. Any email works (throwaway, alias, anything). No real name required. No forced identity. The share token IS the user's public identity, not their name/email. |
| IH1 | **Intel heatmap = followed companies only.** User builds their own heatmap by starring companies. Empty state on first visit. No global defaults in heatmap. |
| IH2 | ~~Follow cost: 10 XP. Floor: -30 XP.~~ **REVERSED 2026-07-19 (Signal Thread S1, verified in code 2026-08-04).** **Following is FREE.** Only limit = compare-slot cap `FOLLOWED_COMPANY_LIMIT` (10): `routers/users.py` charges nothing, `xp_policy.py` records `FOLLOW_COMPANY_XP_COST`/`FLOOR` as retired. Star disables on cap only. Grandfathered payers keep their spend (XP1). |
| IH3 | ~~**Per-company row queries.** Each heatmap row is an independent `useQuery` keyed on `(company, skills)`. Adding a company appends a row without re-fetching others.~~ **REVERSED 2026-06-13 (Shivam-approved, backlog #21):** the per-company fan-out was a 10–15-request thundering herd. Now ONE batched `jobs.skillHeatmap(companies, skills)` (the batched endpoint already existed; `fetch_skill_heatmap_row` was already optimal). Traded incremental row-append for one matrix fetch — acceptable at the 10-company cap + 30-min cache. Do NOT reintroduce the fan-out. |
| IH4 | **Heatmap columns = user's CV skills always.** No global top-8 fallback. Skill Lens toggles which CV skills appear. If no CV uploaded → nudge to upload. |
| IH5 | **Row ordering = most recently starred first** (`created_at DESC` from `followed_companies`). |
| IH6 | **Following a company is explicit user intent.** Saving a job, a listing closing, matching, or any background engine action may suggest a company, but MUST NOT create a Followed Company or consume a compare slot. The legacy Collections auto-follow rule is superseded as of 2026-08-11 and must be removed by the Followed Companies deepening. |
| SH1 | **Ninja Name = vanity slug** as the public profile ID. `user_profiles.ninja_name TEXT UNIQUE NOT NULL`. Charset `^[a-z0-9-]{3,32}$`. The codename IS the share URL: `/profile/{ninja_name}`. Aligns with PV1 — user controls disclosure, no real-name leakage. |
| SH2 | **Ninja name = claimed public identity, not an auto-provisioned default.** Supersedes the old skippable `silent-fox-9k2` onboarding step (476/481 users kept the random slug). A DB placeholder may exist for `UNIQUE NOT NULL` / referrals, but that is not the name Myro shows as *them* on public surfaces until they claim one (`ninja_name_claimed_at`). Suggestion is name-derived, not the random signup slug. Editable later via Settings. |
| SH3 | **Domain Map is the share artifact — fully public, never blurred.** The 12-domain radar from `/skills`, the Myro Score number, the tier label, and aggregate activity counters (forge/diary/tracker counts) are public. Skill names, skill levels, CV, tracker rows, and email NEVER leak through the public surface. |
| SH4 | **Ghost radar is the conversion mechanic.** Logged-out viewer sees an outline-only radar beside (desktop) / below (mobile) the ninja's, with a single `+` icon center and tiny `unlock` label. Whole shape is a single clickable target → `/signup?ref={ninja_name}`. Logged-in viewer with own radar sees their radar overlaid instead of the ghost. |
| SH5 | **Job overlap rows are the logged-in-only accountability surface.** Compact rows of jobs both users have saved (`job_applications.status IN saved/applied/screening/interviewing/final_round`). Max 3 rows, sorted by viewer's own match%. Hide section silently when no overlap. Symmetric — owner doesn't see viewers. |
| SH6 | **Web Share API + auto-OG image** is the share affordance. Single `↗` icon on `/skills` top-right. One tap → native share sheet (WhatsApp first on India mobile). Link unfurls with PNG of the ninja's radar shape + score via `app/profile/[ninja]/opengraph-image.tsx`. Desktop fallback = copy-to-clipboard. No custom share modal. |
| SH7 | **Referral attribution = cookie + permanent DB column.** `myro_ref` cookie 30d TTL set from `?ref=` query. Signup handler resolves cookie → `user_profiles.referred_by_user_id UUID REFERENCES auth.users(id)`. v2 XP credit = single trigger on `welcome_xp_granted` flipping TRUE AND `referred_by_user_id IS NOT NULL`. Self-referral guard. No referrals_log table in v1. |
| SE1 | **Skill-edit creates a NEW `baseline_upload` row.** Baselines stay immutable (Git-commit invariant). `latest_baseline()` returns the new one. |
| SE2 | **Bullet locator = text-match first occurrence (A) + multi-match picker (C).** If >1 verbatim/substring match, router answers 409 with candidates; frontend renders picker; retries with `(section_hint, item_index, bullet_index)`. |
| SE3 | **Skill diff = sync keyword drop (D-sync) + async full LLM re-tag (D-async).** Sync: drop skills whose display_name + evidence_text no longer occur in new body_text. Async: `parse_cv_text` → `record_cv_score` via FastAPI BackgroundTasks. |
| SE4 | **Modal blocks until sync save returns** (~200ms). Score ring shimmers (`tm-score-pulse`) while async runs, via `useRecomputeStore.pendingBaselineId`. |
| SE5 | **Editor scope = single bullet only.** Add-new-bullet + structured editor stay in `/cv`. |
| SE6 | **Skill keyword guard = soft inline hint** when `display_name` not in textarea. Non-blocking. |
| SE7 | **Reference text = greyed mono block under textarea.** No diff view. |
| SE8 | **Ledger title = `Master CV · skill edit · {Skill display name}`.** Orphan baseline (no `parent_version_id`) per existing CVVersionWriteSpec invariant. |
| SE9 | **Tailored versions stay parented to OLD baseline.** No auto-migrate on new baseline. |
| SE10 | **Skill cards stack one-per-row in the expanded domain panel.** No more 200px grid; full width, single column. |
| SE11 | **Card content (top → bottom):** name + L·{Gap/Building/Strong} pill → progress bar → `HOW TO REACH {NEXT_TITLE} (L{n+1})` descriptor → CV pointer as boxed mono `<pre>` → 3 action buttons. |
| SE12 | **3 equal-weight full-label buttons.** Edit CV pointer · Polish with AI · Track in diary. |
| SE13 | **No tap-toggle.** Descriptor + CV pointer always rendered (CV pointer has its own dedicated panel). |
| SE14 | **Mobile (<480px) = icons only.** Labels hidden via `.tm-skill-card-action-label { display: none }`. Buttons keep `aria-label` + `title`. |
| SE15 | **Editable sections = bullets, summary, skills_line, certs.** Education routes to `/cv` (disabled fallback). |
| SE16 | **Backend endpoint = `POST /cv/skill-edit`.** Body `{skill_key, new_text, section_hint?, item_index?, bullet_index?}`. 409 on multi-match with candidate list. |
| SE17 | **Async completion signal = `cv_versions.recompute_finished_at`.** Frontend polls `GET /cv/skill-edit/recompute-status/{baseline_id}` every 3s, cap 30s, clears `useRecomputeStore` + invalidates `userSkills`/`scores` queries. |
| **XP-DB1** | **Welcome XP grant lives at the DB layer.** `user_profiles` BEFORE INSERT trigger adds 3000 XP + flips `welcome_xp_granted`. App code MUST NOT set those fields in the insert payload. Rationale: the 2026-05-23 deploy gap stranded 4 users at 0 XP — invariants in Python = invariants only held when the right code runs. Migration `20260523b_xp_ledger_and_atomic_rpcs`. |
| **XP-DB2** | **Charge / refund are atomic SQL RPCs, never Python read-then-write.** `charge_xp(user_id, amount, action, floor, ref_table, ref_id)` and `refund_xp(...)` (migration 20260523b). The RPC does `UPDATE...WHERE balance - amount >= floor RETURNING` in one statement so two concurrent uploads cannot both pass the funded check. `app.services.xp_service.charge_or_raise / refund` are thin wrappers. |
| **XP-DB3** | **Every balance mutation writes an `xp_ledger` row.** Append-only audit table keyed by `(user_id, action, ref_table, ref_id)`. Bootstrap snapshot per existing user already loaded. Refund RPC short-circuits on prior `refund_*` entry with the same ref — double-refund is structurally impossible. |
| **XP-DB4** | **Charges are tied to the originating row via (ref_table, ref_id).** Pass them whenever a row owns the charge (e.g. `cv_upload_jobs`). Enables ledger reconciliation and refund idempotency. CV upload ordering: insert job row → charge against job_id → mark_charged. Charge denial marks job `failed/insufficient_xp` before raising. |
| **XP-CTA** | **xp_service raises `InsufficientXPError(amount, balance, action)` with a bare detail string. Callers append the recovery CTA.** Diary nudge is right for CV upload; "unfollow another company first" is right for cosmetic follow. The service stays domain-free. |
| **CVUP1** | **POST /cv/upload supports `Idempotency-Key` header (POST /cv/text: body field).** Client-generated UUID stored in localStorage. Backend `cv_upload_jobs.idempotency_key` has a per-user UNIQUE INDEX — retried POSTs return the existing job_id, never double-charge. |
| **CVUP2** | **Persisted job_id resumes after tab close.** Frontend writes `localStorage["myro_cv_upload_job_v1"]` when phase-1 returns `processing`. `/cv` mount checks for it and calls `pollCVUploadStatus` to reconcile. localStorage cleared on terminal state (done/failed). |
| **CVUP3** | **Orphan sweep on FastAPI startup.** `sweep_stale_cv_upload_jobs(5)` RPC marks any `processing` job > 5min as failed and refunds via the idempotent refund_xp. Runs in `app.main._sweep_orphaned_cv_upload_jobs` so Railway redeploys never strand users on immortal processing jobs. |
| **CVUP4** | **Scanned-PDF guard before charge.** Phase 1 rejects extracted text shorter than 80 non-whitespace chars with HTTP 422, never reaches the charge. Eliminates the charge → no_skills → refund retry loop that bit `thui46348` 3× on 2026-05-23. |
| **METRIC1** | **Refund-rate alert hook.** `xp_service.refund` emits structured `"metric refund.fired action=… reason=… amount=… ref=…/…"` warning. Refund rate > 5% over a rolling window indicates the LLM provider chain is degraded; wire Grafana / log alert when monitoring is set up. |

---

## DB SCHEMA (key tables)

- `user_profiles`: `coin_balance INTEGER`, `welcome_coins_granted BOOLEAN`, `linkedin_coins_granted BOOLEAN` — **the `xp_*` columns are DROPPED** (contract migration `20260622_coins_rename_contract`, verified live 2026-08-04). Mutate only via `charge_coins` / `refund_coins` / `reward_coins`; ledger is `coin_ledger`. Never write `xp_balance`.
- `user_profiles`: `target_locations TEXT[]`, `target_location_countries TEXT[]` (multi-location targeting, live) + legacy scalars `target_location` / `target_location_country`
- `daily_logs`: `cart_skills JSONB NOT NULL DEFAULT '[]'`
- `forge_sessions`: legacy table, still readable, but **timed forge XP earning is retired** — nothing writes new earn rows.
- `user_skills`: `forge_sessions_count INTEGER NOT NULL DEFAULT 0` — display counter only; real practice progression lives in `skill_assessed_level` (Upskilling quiz clears).
- `job_skills (job_id FK→jobs, skill_id FK→skills, is_primary BOOLEAN)` — canonical skill source
- `followed_companies (user_id, company_id, company_name, UNIQUE(user_id, company_id))` — RLS-protected canonical Followed Company identity; `company_name` is display/audit data
- `jobs.location_country / location_city / location_mode / location_quality` — all backfilled
- `cv_history.content_hash TEXT` — SHA-256 of raw extracted text for re-upload short-circuit
