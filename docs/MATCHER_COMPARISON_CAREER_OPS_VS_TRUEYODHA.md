# Matcher Comparison — True_Yodha vs Career Ops Agent

> **Status: EXPLORATION — decide next session.** Not a decision yet.
> Author handoff: Claude (firecrawl_Supabase session, 2026-05-27).
> Goal: pick the canonical job-matching architecture for Myro/True_Yodha, or a merge of both.

Both systems are **two-stage cascades** (cheap deterministic prefilter → LLM re-rank) reading the
same Supabase `jobs` / `job_skills` / `skills` tables that `firecrawl_Supabase` populates. They
diverge in *what* the deterministic stage scores and *how rich* the LLM stage is.

---

## Side-by-side

| Dimension | **True_Yodha `job_matcher.py`** | **Career Ops Agent `prefilter.py` + `prompts.py`** |
|---|---|---|
| Stage-1 signal | Taxonomy skill-overlap via normalized `job_skills` FK join | Keyword/heuristic over `main_skills[]` + `role_domain` + title + location |
| Stage-1 formula | `weighted_matches / max_possible × 100`; main=2, side=1 | additive weights: domain + title kw ± penalties + skill overlap + location |
| Stage-1 personalization | `user_skills` levels (from forge/CV), `target_roles` | `profile.yaml` lens + CV-skill set (hardcoded list) |
| Aspiration boost | +30% when `target_role` token in title | title keyword bonuses (gtm/consult/strategy…) |
| Anti-bias | **company cap 30% of top-N** | none (BCG/Genpact can dominate) |
| Pool resilience | tiered floor 3→2 skill overlap if pool underfills | none (just top-N by score) |
| Stage-2 model | LLM re-rank top 10 + 2-sentence explanation | LLM full eval top-N |
| Stage-2 output | `{rank, explanation}` | `{overall, role/comp/growth/culture/risk, grade, recommendation, strengths, concerns, application_angle}` |
| Stage-2 lens | skill-map JSON, "true fit not keyword overlap" | full CV markdown + deal-breakers + comp/growth/risk reasoning |
| Provider | LLM chain: OpenRouter free → Groq → Gemini → paid | OpenRouter, user-supplied key, any slug |
| Cost control | XP-gated, weekly cache per user/batch_week | manual run; prefilter caps LLM calls |
| Cache | `user_job_matches` per user/week | none (writes `out/` files) |

---

## What each does better

**True_Yodha is stronger at stage 1:**
- Uses the *normalized taxonomy* (`job_skills.required_level`, `skills.taxonomy_key`) — real skill IDs,
  not substring matching. Career Ops's keyword overlap is brittle (e.g. "sales" matches "salesforce").
- **Company cap (30%)** prevents one mega-employer flooding results — Career Ops's `out/` list is
  Genpact/BCG/Deloitte-heavy precisely because it lacks this.
- Tiered overlap floor keeps narrow CVs from returning empty.

**Career Ops is stronger at stage 2:**
- 5-axis scoring (comp / growth / culture / risk) + explicit **deal-breakers** + **Apply/Skip verdict**
  + **application angle** is far richer than True_Yodha's `{rank, explanation}`.
- CV-first lens (full markdown) catches fit nuance the skill-map alone misses (seniority, narrative,
  over-qualification risk).

---

## Recommendation to evaluate next session

**Merge, don't replace.** Best-of-both architecture:

```
Stage 1  = True_Yodha job_matcher.get_top_matches()   (taxonomy overlap + company cap + tiered floor)
Stage 2  = Career Ops 5-axis eval prompt              (role/comp/growth/culture/risk + verdict + angle)
```

Concretely, to explore:
1. Keep `job_matcher.py` as the deterministic prefilter (it already feeds `llm_ranker.py`).
2. Upgrade `llm_ranker.py`'s prompt from `{rank, explanation}` to the Career Ops schema
   (add comp/growth/culture/risk, Apply/Skip, application_angle, deal-breakers from `user_profiles`).
3. Persist the new fields on `user_job_matches` (migration) so the frontend job cards can show
   grade + verdict + "why apply" angle, not just a %.
4. Decide whether deal-breakers become a first-class profile field (they're implicit today).

**Open questions for the decision:**
- Does the extra LLM output cost (longer completions × every matched job) fit the XP economy?
- Do we expose 5-axis scores to users, or keep them internal and surface only grade + angle?
- Career Ops's location/role weights are hardcoded for one candidate (Shivam/NCR) — in True_Yodha
  these must come from `user_profiles` (target_roles, preferred locations). Confirm those columns exist.

## Source pointers
- True_Yodha: `backend/app/services/job_matcher.py`, `backend/app/services/llm_ranker.py`,
  `backend/app/routers/jobs/match.py`, table `user_job_matches`.
- Career Ops: `firecrawl_Supabase/career_ops_agent/{prefilter,prompts,agent}.py`.
