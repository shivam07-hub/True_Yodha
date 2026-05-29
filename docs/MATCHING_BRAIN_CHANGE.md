# Matching Brain Change

> **Status: PLAN — approved, thin-slice first cut.**
> Decided 2026-05-29. Replaces the thin Stage-2 LLM ranker with the Career Ops
> 5-axis evaluation brain. Companion to `MATCHER_COMPARISON_CAREER_OPS_VS_TRUEYODHA.md`.
> Test gate: author runs a real CV through the frontend after the thin slice ships.

---

## Decision summary

Job matching is a two-stage cascade. Both True_Yodha and the Career Ops Agent
(`firecrawl_Supabase/career_ops_agent/`) share this shape:

```
Stage 1  deterministic prefilter  → shortlist
Stage 2  LLM re-rank / evaluate    → scored, explained
```

**Keep Stage 1, replace Stage 2.**

- **Stage 1 stays** = True_Yodha `job_matcher.get_top_matches()` — taxonomy skill
  overlap via `job_skills` FK join + company cap (30%) + tiered overlap floor +
  per-user `target_roles`. It is strictly better than the Career Ops `prefilter.py`,
  which is hardcoded to ONE candidate (Shivam / NCR cities / fixed `CV_SKILLS`) and
  has no company cap. Swapping Stage 1 would be a multi-user regression.
- **Stage 2 is replaced** = port the Career Ops `prompts.py` brain (5-axis scoring +
  grade + Apply/Negotiate/Skip verdict + `application_angle` + strengths/concerns)
  into `llm_ranker.py`. True_Yodha's current Stage 2 only emits `{rank, explanation}`.

### Decisions locked
| Question | Choice |
|---|---|
| Stage 1 | Keep True_Yodha `job_matcher.py` (do not adopt Career Ops prefilter) |
| Stage 2 brain | Port Career Ops 5-axis prompt into `llm_ranker.py` (port, not import) |
| Profile source | Eventually add profile fields; **thin slice uses skill-map + target_roles + CV `body_text` only** |
| Cost model | Per-job eval (1 LLM call/job). XP bump deferred until measured |
| First cut | **Thin slice** — ship brain swap + persist + frontend display, then test |

---

## Career Ops Stage-2 schema (the target output)

Per job, the brain returns:

```json
{
  "overall_score": float,           // 0.0–5.0, never rounded to whole
  "grade": "A+|A|A-|B+|B|B-|C+|C|C-|D|F",
  "role_fit": float,
  "comp_fit": float,
  "growth_fit": float,
  "culture_fit": float,
  "risk_score": float,              // HIGHER = riskier
  "summary": "2-3 sentence honest summary",
  "strengths": ["...", "..."],
  "concerns": ["...", "..."],
  "recommendation": "Apply|Negotiate|Skip",
  "application_angle": "1-2 sentences: how THIS candidate should position"
}
```

Source prompts: `firecrawl_Supabase/career_ops_agent/prompts.py`
(`build_system_prompt`, `build_job_context`).

---

## Current state (what exists today)

- Pipeline wiring: `backend/app/services/jobs_workflow.py::compute_job_matches`
  → `job_matcher.get_top_matches(top_n=12)` → `llm_ranker.rank_and_persist()`.
- Stage-2 today: `backend/app/services/llm_ranker.py` — ONE batched call for all
  ~12 jobs, returns `[{job_id, rank, explanation}]`. Persists to `user_job_matches`.
- Provider chain: `LLMProvider` (free OpenRouter → Groq → Gemini → paid).
- Refresh seam: `backend/app/services/job_refresh/` (XP charge/refund, dispatch,
  `_pipeline.run`). XP cost const: `xp_policy.MATCH_REFRESH_XP_COST = 50`.
- Profile data available: `user_profiles(target_roles, target_location,
  target_location_country)` via `JobsRepository.get_user_profile_targeting`.
  **No** `deal_breakers / salary / work_mode / career_goal / superpower` columns yet.
- CV text lives in `cv_versions.body_text` (+ `polished_text`, `cv_structured` jsonb).
- API shape: `routers/jobs/_shared.py::to_job_match` → `JobMatchResponse`.
- Cards delivered to user: `frontend/components/jobs/JobCard.tsx` (today: company,
  title, location, fit % big number + bar, matched-skill chips, "Why this is a good
  fit" = `llm_explanation`, Save / Tailor CV / Open role). `onSelect` already wired
  for a detail view ("modal").

---

## Thin-slice build (first cut — ships, then author tests)

**1. Migration** — `user_job_matches` add nullable columns:
`grade text`, `recommendation text`, `application_angle text`, `summary text`,
`role_fit numeric`, `comp_fit numeric`, `growth_fit numeric`, `culture_fit numeric`,
`risk_score numeric`, `strengths text[]`, `concerns text[]`.
(No `user_profiles` change in the thin slice.)

**2. Repo** — `get_user_profile_targeting` also fetches the user's latest CV text
(`cv_versions.polished_text or body_text`, thread head). Missing profile fields
(deal_breakers/salary/work_mode/career_goal/superpower) pass through as `None` →
the ported prompt already prints "not specified".

**3. `llm_ranker.py` brain swap** —
- Port `build_system_prompt` + `build_job_context` from Career Ops `prompts.py`.
- Change Stage 2 from one batched call to **per-job** calls over the top ~12,
  reusing the existing `LLMProvider` chain.
- Parse ONE JSON object per job (not an array); map by `job_id`.
- Keep the existing failure fallback (store overlap score + null verdict).
- `persist_matches` writes the new columns.

**4. API** — `JobMatchResponse` + `to_job_match` expose the new fields.

**5. Frontend** —
- `JobMatch` type (`frontend/lib/api.ts`) grows the new fields.
- `JobCard.tsx`: add **grade badge** (next to fit number), **verdict pill**
  (Apply=green / Negotiate=amber / Skip=red), surface `application_angle`
  (sharper than the generic explanation). Keep 5-axis OFF the card.
- **Match-detail view ("modal")**: 5-axis bars (role/comp/growth/culture/risk),
  `summary`, `strengths[]` (green), `concerns[]` (red), full `application_angle`,
  grade + verdict header. Opened via existing `onSelect`.

**Tests touched:** `backend/tests/test_llm_ranker.py` (rewrite for per-job +
new schema), `backend/tests/test_job_matcher.py` (matcher untouched — should pass).

---

## Follow-ups — DONE (2026-05-30)

- **Onboarding profile fields — DONE.** Added `deal_breakers text[]`, `career_goal text`,
  `superpower text` to `user_profiles` (migration `20260530b_user_profile_match_lens.sql`).
  (Dropped `salary_target` + `work_mode` from the original plan — not selected.) Captured
  in an OPTIONAL, skippable onboarding step (`frontend/components/onboarding/step-lens.tsx`,
  wired in `app/onboarding/page.tsx` between role and companies). `get_user_profile_targeting`
  reads them; `build_system_prompt` uses them (deal-breaker → Skip rule; goal/superpower →
  growth_fit + application_angle). Schemas: `UpdateProfileRequest` + `UserProfileResponse` +
  frontend `ProfileUpdate`/`UserProfile`.
- **XP economy — DONE.** Real cost ≈ 3–4× (input-dominated by CV+JD per call, not 10–15×).
  `MATCH_REFRESH_XP_COST` bumped 50 → **150**, priced just below `CV_UPLOAD_XP_COST` (200).
  Refund path unchanged. Tune in `xp_policy.py` if the economy shifts.

## Same-week refresh — RESOLVED (2026-05-30)

- **Decision:** a user may Refresh again in the same week if they choose to spend the XP.
- `compute_job_matches` gained `force: bool = False`. The paid Refresh path
  (`job_refresh/_pipeline.py`) passes `force=True` → skips the weekly `is_cache_valid`
  short-circuit and always re-runs the brain. The free CV-upload initial compute keeps
  `force=False` so it never re-charges work already done.
- Refresh still passes `excluded_job_ids` (this week's existing matches), so each paid
  Refresh surfaces *additional* brain-ranked jobs; when the pool is exhausted the XP is
  refunded. NOTE: it does not re-rank rows already present.
- **One-time migration caveat:** rows written by the OLD matcher before this change have
  null brain fields and are excluded by `excluded_job_ids`, so they won't gain a grade on
  Refresh. For a clean first look, delete this week's rows once, then Refresh.

---

## Risks / watch

- **Provider rate-limit / latency:** per-job × 12 sequential calls on free providers
  may throttle or slow the refresh. Fallback options if it bites: reduce top-N, or
  deep-eval only top 3 and cheap-rank the rest.
- **Cost vs XP mismatch:** thin slice intentionally does NOT raise XP yet — flag the
  real token count before changing the economy.
- **Single-candidate leakage:** when porting the prompt, strip Career Ops's
  Shivam/NCR hardcoded biases (NCR location reward, GTM-only rewards) so they come
  from the per-user profile, not the prompt text. The thin slice has no profile
  fields yet, so keep the hard rules generic / driven by `target_roles` + location.

---

## Source pointers
- True_Yodha: `backend/app/services/{jobs_workflow,llm_ranker,job_matcher}.py`,
  `backend/app/services/job_refresh/`, `backend/app/repositories/jobs.py`,
  `backend/app/routers/jobs/{match,_shared}.py`, `backend/app/schemas.py`,
  `frontend/components/jobs/JobCard.tsx`, `frontend/lib/api.ts`,
  table `user_job_matches`, const `xp_policy.MATCH_REFRESH_XP_COST`.
- Career Ops brain: `firecrawl_Supabase/career_ops_agent/{prompts,prefilter,agent}.py`.
