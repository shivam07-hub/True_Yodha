"""
llm_ranker.py
Stage-2 of the matcher: the Matching Brain.

Per shortlisted job, runs the Career Ops 5-axis evaluation (role/comp/growth/
culture/risk) + grade + Apply/Negotiate/Skip verdict + application angle +
strengths/concerns, judged against the candidate's CV and targeting profile.

Ported (not imported) from firecrawl_Supabase/career_ops_agent/prompts.py and
de-biased: the single-candidate (NCR / GTM-only) hard rules are replaced by the
per-user profile (target_roles + location). See docs/MATCHING_BRAIN_CHANGE.md.

Cost control:
  - One LLM call PER job over the top ~12 — richer but pricier than the old single
    batched call. XP economy bump is deferred (measure first).
  - Result cached in user_job_matches for the user/week; invalidated on CV upload.

Provider chain is managed by LLMProvider (services/llm_provider.py).
Called from: the Job Refresh seam (services/job_refresh/) and the
CV-upload fire-and-forget initial-match compute (services/cv_workflow.py).
"""

import asyncio
import json
import logging
import re
from datetime import date, datetime, timezone
from typing import Any

from supabase import Client

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 900
_RECOMMENDATIONS = {"Apply", "Negotiate", "Skip"}
# Bound on concurrent per-job LLM calls. Keep low — the provider chain fails over
# per call and free tiers rate-limit. See docs/MATCHING_BRAIN_CHANGE.md risks.
_CONCURRENCY = 3


# ── Cache check ───────────────────────────────────────────────────────────────

def has_matches_this_week(db: Client, user_id: str, batch_week: date) -> bool:
    """Returns True if any matches exist for this user/week."""
    result = (
        db.table("user_job_matches")
        .select("job_id")
        .eq("user_id", user_id)
        .eq("batch_week", str(batch_week))
        .limit(1)
        .execute()
    )
    return bool(result.data)


def is_cache_valid(db: Client, user_id: str, batch_week: date) -> bool:
    return has_matches_this_week(db, user_id, batch_week)


# ── Prompt building ───────────────────────────────────────────────────────────

def build_system_prompt(profile: dict[str, Any], cv_markdown: str) -> str:
    """Career Ops evaluator persona, driven by the per-user profile.

    Unlike the source agent, this carries NO hardcoded location/role bias — the
    rewards and penalties come from the candidate's own target_roles and location.
    """
    roles = ", ".join(profile.get("target_roles") or []) or "their stated target roles"
    location = (
        profile.get("target_location")
        or profile.get("target_location_country")
        or "flexible"
    )
    deal_breakers = ", ".join(profile.get("deal_breakers") or []) or "none specified"
    career_goal = profile.get("career_goal") or "not specified"
    superpower = profile.get("superpower") or "not specified"
    cv_block = (cv_markdown or "").strip()[:4000] or "No CV on file — infer from the skill profile."

    return f"""You are Career Ops, an elite AI career advisor. You evaluate a job posting against ONE specific candidate with brutal honesty and strategic insight. No flattery, no score inflation.

This candidate:
- Target roles: {roles}
- Preferred location: {location}
- Career goal: {career_goal}
- Superpower: {superpower}
- Deal-breakers: {deal_breakers}

CV:
{cv_block}

Score the posting on a 0.0–5.0 scale (use decimals; NEVER round to whole numbers):
- role_fit: match to skills, experience, seniority, and the candidate's target roles
- comp_fit: likely compensation vs the candidate's level/market (infer if undisclosed)
- growth_fit: will this accelerate the candidate's trajectory?
- culture_fit: alignment with the candidate's work style and the org implied
- risk_score: stability / over-qualification / mis-fit risk (HIGHER = riskier)

Grade mapping: 4.5+ = A+, 4.0+ = A, 3.5+ = B+, 3.0+ = B, 2.5+ = C+, 2.0+ = C, below = D/F.

Rules:
- Reward strong alignment with the candidate's target roles; penalise roles far outside them.
- Reward the candidate's preferred location; flag relocation risk otherwise (do not hard-fail).
- If the posting clearly violates a stated deal-breaker, recommendation MUST be "Skip" and the summary must name the deal-breaker. ("none specified" means no hard filters.)
- Judge growth_fit against the candidate's career goal, and frame application_angle around their superpower when stated.
- If overall_score < 3.5, recommendation MUST be "Skip" and summary must say why not to apply.

Respond ONLY with valid JSON, no prose outside it, matching exactly:
{{
  "overall_score": float,
  "grade": "A+|A|A-|B+|B|B-|C+|C|C-|D|F",
  "role_fit": float,
  "comp_fit": float,
  "growth_fit": float,
  "culture_fit": float,
  "risk_score": float,
  "summary": "2-3 sentence honest summary",
  "strengths": ["...", "..."],
  "concerns": ["...", "..."],
  "recommendation": "Apply|Negotiate|Skip",
  "application_angle": "1-2 sentences on how THIS candidate should position themselves if applying"
}}"""


def build_job_context(job: dict[str, Any]) -> str:
    """Render one shortlisted job for the evaluator.

    `job` is a get_top_matches() result: title/company/location/industry/
    matched_skills/description/overlap_score.
    """
    matched = ", ".join(job.get("matched_skills") or []) or "n/a"
    return f"""Job Title: {job.get('title')}
Company: {job.get('company') or 'n/a'}
Industry: {job.get('industry') or 'n/a'}
Location: {job.get('location') or 'n/a'}
Skills this candidate already matches: {matched}
Deterministic skill-overlap score (0–100): {job.get('overlap_score')}

Job Description:
{(job.get('description') or 'No description available')[:6000]}"""


# ── Response parser ───────────────────────────────────────────────────────────

def _clamp(value: Any, lo: float, hi: float, default: float | None) -> float | None:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def parse_eval(text: str) -> dict[str, Any] | None:
    """Extract and validate one evaluation JSON object from the LLM response."""
    # Strip <think>…</think> emitted by reasoning-distilled models (no-op if absent).
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start == -1:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None

    rec = obj.get("recommendation")
    overall = _clamp(obj.get("overall_score"), 0.0, 5.0, None)
    # Enforce the Skip-below-3.5 rule even if the model forgot it.
    if overall is not None and overall < 3.5:
        rec = "Skip"
    if rec not in _RECOMMENDATIONS:
        rec = None

    return {
        "overall_score": overall,
        "grade": (obj.get("grade") or None),
        "role_fit": _clamp(obj.get("role_fit"), 0.0, 5.0, None),
        "comp_fit": _clamp(obj.get("comp_fit"), 0.0, 5.0, None),
        "growth_fit": _clamp(obj.get("growth_fit"), 0.0, 5.0, None),
        "culture_fit": _clamp(obj.get("culture_fit"), 0.0, 5.0, None),
        "risk_score": _clamp(obj.get("risk_score"), 0.0, 5.0, None),
        "summary": (obj.get("summary") or None),
        "strengths": [str(s) for s in (obj.get("strengths") or [])][:5],
        "concerns": [str(c) for c in (obj.get("concerns") or [])][:5],
        "recommendation": rec,
        "application_angle": (obj.get("application_angle") or None),
    }


# ── LLM call (per job) ─────────────────────────────────────────────────────────

async def evaluate_job(
    job: dict[str, Any],
    system_prompt: str,
    provider: LLMProvider,
) -> dict[str, Any] | None:
    """Evaluate one job. Returns parsed eval dict or None on failure."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": build_job_context(job)},
    ]
    try:
        content = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.error("Job eval providers failed for job=%s", job.get("job_id"))
        return None
    parsed = parse_eval(content)
    if parsed is None:
        logger.warning("LLM ranker: unparseable eval for job=%s", job.get("job_id"))
    return parsed


async def evaluate_all(
    profile: dict[str, Any],
    top_jobs: list[dict[str, Any]],
    provider: LLMProvider,
) -> dict[str, dict[str, Any]]:
    """Evaluate every shortlisted job. Returns {job_id: eval}. Failed jobs omitted."""
    system_prompt = build_system_prompt(profile, profile.get("cv_markdown") or "")
    sem = asyncio.Semaphore(_CONCURRENCY)

    async def _one(job: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
        async with sem:
            return str(job["job_id"]), await evaluate_job(job, system_prompt, provider)

    results = await asyncio.gather(*(_one(j) for j in top_jobs))
    return {jid: ev for jid, ev in results if ev is not None}


# ── Persist ───────────────────────────────────────────────────────────────────

def persist_matches(
    db: Client,
    user_id: str,
    batch_week: date,
    top_jobs: list[dict],
    evaluations: dict[str, dict],
) -> int:
    """Upsert weekly matches to user_job_matches. Returns count written.

    `evaluations` maps job_id → parse_eval() output. Jobs without an evaluation
    fall back to overlap-score-only rows (verdict fields null).
    llm_rank is derived from overall_score (eval'd jobs first), and
    llm_explanation mirrors `summary` for back-compat with older readers.
    """
    now = datetime.now(timezone.utc).isoformat()

    # Defensive dedupe by job_id, keeping the highest overlap_score seen.
    jobs_by_id: dict[str, dict] = {}
    for job in top_jobs:
        jid = str(job["job_id"])
        prev = jobs_by_id.get(jid)
        if prev is None or (job.get("overlap_score") or 0) > (prev.get("overlap_score") or 0):
            jobs_by_id[jid] = job

    # Rank order: eval'd jobs by overall_score desc, then the rest by overlap_score.
    ordered = sorted(
        jobs_by_id.values(),
        key=lambda j: (
            evaluations.get(str(j["job_id"]), {}).get("overall_score") or -1.0,
            j.get("overlap_score") or 0.0,
        ),
        reverse=True,
    )

    rows: list[dict] = []
    for rank_idx, job in enumerate(ordered, start=1):
        jid = str(job["job_id"])
        ev = evaluations.get(jid) or {}
        rows.append({
            "user_id": user_id,
            "job_id": jid,
            "batch_week": str(batch_week),
            "overlap_score": job["overlap_score"],
            "matched_skills": job.get("matched_skills") or [],
            "llm_rank": rank_idx,
            "llm_explanation": ev.get("summary"),
            "overall_score": ev.get("overall_score"),
            "grade": ev.get("grade"),
            "recommendation": ev.get("recommendation"),
            "application_angle": ev.get("application_angle"),
            "summary": ev.get("summary"),
            "role_fit": ev.get("role_fit"),
            "comp_fit": ev.get("comp_fit"),
            "growth_fit": ev.get("growth_fit"),
            "culture_fit": ev.get("culture_fit"),
            "risk_score": ev.get("risk_score"),
            "strengths": ev.get("strengths") or [],
            "concerns": ev.get("concerns") or [],
            "computed_at": now,
        })

    if rows:
        db.table("user_job_matches").upsert(
            rows, on_conflict="user_id,job_id,batch_week"
        ).execute()

    return len(rows)


# ── Main entry point ──────────────────────────────────────────────────────────

async def rank_and_persist(
    db: Client,
    user_id: str,
    batch_week: date,
    profile: dict[str, Any],
    top_jobs: list[dict],
    provider: LLMProvider,
) -> int:
    """Full Stage-2 pipeline: per-job 5-axis eval → persist. Returns rows written."""
    if not top_jobs:
        return 0

    evaluations = await evaluate_all(profile, top_jobs, provider)
    if not evaluations:
        logger.warning(
            "Matching Brain: all evals failed for user %s — storing overlap scores only",
            user_id,
        )
    return persist_matches(db, user_id, batch_week, top_jobs, evaluations)