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
  - Result cached in user_job_matches permanently per (user, job) — Backlog #36
    de-weekly; reused across scrapes/opens, overwritten on re-eval (CV upload,
    force refresh).

Provider chain is managed by LLMProvider (services/llm_provider.py).
Called from: the Job Refresh seam (services/job_refresh/) and the
CV-upload fire-and-forget initial-match compute (services/cv_workflow.py).
"""

import asyncio
import json
import logging
import re
from datetime import date, datetime, timezone
from collections.abc import Callable
from typing import Any

from supabase import Client

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 900
_RECOMMENDATIONS = {"Apply", "Negotiate", "Skip"}
_LEGITIMACY_TIERS = {"high_confidence", "caution", "suspicious"}
# Bound on concurrent per-job LLM calls. Keep low — the provider chain fails over
# per call and free tiers rate-limit. See docs/MATCHING_BRAIN_CHANGE.md risks.
_CONCURRENCY = 3


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

    # Targeting Brief: memory facts (authored + distilled) ride as known_facts —
    # the same key the intent-chat concierge reads. Soft context, never hard rules.
    facts = [str(f).strip() for f in (profile.get("known_facts") or []) if str(f).strip()]
    facts_block = ""
    if facts:
        lines = "\n".join(f"- {f}" for f in facts)
        facts_block = f"\n\nWhat Myro remembers about this candidate (their notes + observed activity):\n{lines}"

    return f"""You are Career Ops, an elite AI career advisor. You evaluate a job posting against ONE specific candidate with brutal honesty and strategic insight. No flattery, no score inflation.

This candidate:
- Target roles: {roles}
- Preferred location: {location}
- Career goal: {career_goal}
- Superpower: {superpower}
- Deal-breakers: {deal_breakers}{facts_block}

CV:
{cv_block}

Score the posting on a 0.0–5.0 scale (use decimals; NEVER round to whole numbers):
- role_fit: match to skills, experience, seniority, and the candidate's target roles
- comp_fit: likely compensation vs the candidate's level/market (infer if undisclosed)
- growth_fit: will this accelerate the candidate's trajectory?
- culture_fit: alignment with the candidate's work style and the org implied
- risk_score: stability / over-qualification / mis-fit risk (HIGHER = riskier)

Grade mapping: 4.5+ = A+, 4.0+ = A, 3.5+ = B+, 3.0+ = B, 2.5+ = C+, 2.0+ = C, below = D/F.

Also classify and legitimacy-check the posting (Career Ops Block A + Block G):
- archetype: the role's archetype in 1-3 words (e.g. "Data Scientist", "Product Manager", "Solutions Architect", "LLMOps", "Sales / GTM"). If hybrid, name the two closest joined by "/".
- legitimacy_tier: judge whether this is a real, live, worth-applying posting from the description ALONE (you have no web access):
    "high_confidence" — specific tech stack + team/scope detail, salary or clear responsibilities, no contradictions.
    "caution"         — vague or boilerplate-heavy, generic responsibilities, thin detail, or mild contradictions.
    "suspicious"      — ghost/scam signals: no real scope, pay-to-apply / upfront-fee language, contradictory seniority vs pay, mass-generic "rockstar/ninja" filler with no substance, or a JD that reads like a template with nothing concrete.
- legitimacy_reason: one short phrase naming the strongest signal behind the tier (e.g. "detailed stack + scope", "boilerplate, no specifics", "asks for an upfront fee").

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
  "application_angle": "1-2 sentences on how THIS candidate should position themselves if applying",
  "archetype": "1-3 word role archetype",
  "legitimacy_tier": "high_confidence|caution|suspicious",
  "legitimacy_reason": "short phrase naming the strongest signal"
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


# ── Tier-1 triage (cheap, batched: pool → shortlist) ──────────────────────────
# Career-Ops shape: a deterministic pre-filter (role-title + location + freshness +
# skill-overlap) hands the brain a POOL of candidates (~tens), and ONE cheap batched
# call picks the best-fit shortlist. Only that shortlist then gets the expensive
# per-job 5-axis "why it fits" reasoning (evaluate_all). This is how we rate against
# the whole relevant pool without paying a deep eval per pool job.

_TRIAGE_MAX_TOKENS = 500
# Per-job description slice in the triage prompt — enough to judge fit, small enough
# to keep the pool inside every provider's context window.
_TRIAGE_SNIPPET = 220
# Max jobs in ONE triage LLM call. A larger pool is triaged as a tournament: chunks
# of this size run in parallel, each yields its best keep_n, and the winners triage
# again until they fit one call. This lets the POOL grow large (more role-relevant
# candidates reach the brain) while every prompt stays inside the free-provider
# context window and keeps triage quality high (a model ranks 50 rows far better
# than 300). Must stay > any realistic keep_n so the tournament always converges.
_TRIAGE_CHUNK = 50


def build_triage_prompt(profile: dict[str, Any], cv_markdown: str) -> str:
    """Compact evaluator persona for the batched pool→shortlist triage pass."""
    roles = ", ".join(profile.get("target_roles") or []) or "their stated target roles"
    location = (
        profile.get("target_location")
        or profile.get("target_location_country")
        or "flexible"
    )
    cv_block = (cv_markdown or "").strip()[:2000] or "No CV on file — infer from the skill profile."
    return f"""You are Career Ops, an elite AI career advisor triaging a batch of job postings for ONE candidate. Pick only the strongest genuine fits — never pad the list to reach the count. Judge on true role/skill/seniority fit to THIS candidate, not keyword overlap.

Candidate target roles: {roles}
Preferred location: {location}

CV:
{cv_block}"""


def build_triage_user(pool_jobs: list[dict[str, Any]], keep_n: int) -> str:
    """Numbered pool for the triage call. Uses 1-based indices (robust — the model
    echoes small integers, never mangled job_ids)."""
    lines = []
    for i, job in enumerate(pool_jobs, start=1):
        matched = ", ".join((job.get("matched_skills") or [])[:8]) or "n/a"
        snippet = " ".join((job.get("description") or "").split())[:_TRIAGE_SNIPPET]
        lines.append(
            f"{i}. {job.get('title')} — {job.get('company') or 'n/a'} "
            f"| {job.get('location') or 'n/a'} | matched: {matched} | overlap: {job.get('overlap_score')}"
            f"\n   {snippet}"
        )
    listing = "\n".join(lines)
    return f"""{len(pool_jobs)} candidate postings below. Select the {keep_n} BEST-FIT for this candidate, ranked best-first. Fewer is fine if fewer are genuinely strong — do NOT include weak fits to reach {keep_n}.

{listing}

Respond ONLY with valid JSON, no prose:
{{"shortlist": [<index>, <index>, ...]}}"""


def parse_triage(text: str, pool_size: int, keep_n: int) -> list[int] | None:
    """Parse the triage JSON → 0-based pool indices. None on unparseable output."""
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
    if not isinstance(obj, dict) or not isinstance(obj.get("shortlist"), list):
        return None
    seen: set[int] = set()
    out: list[int] = []
    for raw in obj["shortlist"]:
        try:
            idx = int(raw) - 1
        except (TypeError, ValueError):
            continue
        if 0 <= idx < pool_size and idx not in seen:
            seen.add(idx)
            out.append(idx)
        if len(out) >= keep_n:
            break
    return out


async def _triage_once(
    profile: dict[str, Any],
    pool_jobs: list[dict[str, Any]],
    provider: LLMProvider,
    keep_n: int,
) -> list[dict[str, Any]]:
    """ONE triage LLM call over a single (chunk-sized) pool → keep_n best-fit.

    Fails soft: on any provider/parse failure return the pool's deterministic-
    overlap order truncated to keep_n — the deep eval still runs, just on the
    overlap head instead of the brain-ranked head. Never breaks the compute.
    """
    messages = [
        {"role": "system", "content": build_triage_prompt(profile, profile.get("cv_markdown") or "")},
        {"role": "user", "content": build_triage_user(pool_jobs, keep_n)},
    ]
    try:
        content = await provider.complete(messages, max_tokens=_TRIAGE_MAX_TOKENS)
    except LLMProviderError:
        logger.error("triage: providers failed over pool=%d — falling back to overlap order", len(pool_jobs))
        return pool_jobs[:keep_n]
    indices = parse_triage(content, len(pool_jobs), keep_n)
    if not indices:
        logger.warning("triage: unparseable/empty shortlist — falling back to overlap order")
        return pool_jobs[:keep_n]
    return [pool_jobs[i] for i in indices]


async def triage_shortlist(
    profile: dict[str, Any],
    pool_jobs: list[dict[str, Any]],
    provider: LLMProvider,
    keep_n: int,
) -> list[dict[str, Any]]:
    """Cheap batched pass: pool → the ``keep_n`` best-fit jobs, brain-ranked.

    A pool up to ``_TRIAGE_CHUNK`` is one LLM call. A larger pool is a tournament:
    chunks of ``_TRIAGE_CHUNK`` triage in parallel, each yields its best ``keep_n``,
    and the merged winners triage again until they fit one call. So the pool can be
    large (more role-relevant candidates reach the brain) while every prompt stays
    within context and triage stays sharp. Converges because ``keep_n`` <
    ``_TRIAGE_CHUNK``, so each round shrinks the field. Fails soft throughout.
    """
    if keep_n <= 0:
        return []
    if len(pool_jobs) <= keep_n:
        return pool_jobs
    if len(pool_jobs) <= _TRIAGE_CHUNK:
        return await _triage_once(profile, pool_jobs, provider, keep_n)

    chunks = [pool_jobs[i:i + _TRIAGE_CHUNK] for i in range(0, len(pool_jobs), _TRIAGE_CHUNK)]
    round_results = await asyncio.gather(
        *(_triage_once(profile, chunk, provider, keep_n) for chunk in chunks)
    )
    finalists = [job for chunk_result in round_results for job in chunk_result]
    # Winners collapse toward keep_n each round → recursion terminates.
    return await triage_shortlist(profile, finalists, provider, keep_n)


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
        "archetype": (str(obj["archetype"]).strip()[:60] or None) if obj.get("archetype") else None,
        "legitimacy_tier": (
            obj["legitimacy_tier"]
            if obj.get("legitimacy_tier") in _LEGITIMACY_TIERS
            else None
        ),
        "legitimacy_reason": (str(obj["legitimacy_reason"]).strip()[:160] or None) if obj.get("legitimacy_reason") else None,
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


RankProgressCb = Callable[[int, int, dict[str, Any]], None]


async def evaluate_all(
    profile: dict[str, Any],
    top_jobs: list[dict[str, Any]],
    provider: LLMProvider,
    on_progress: RankProgressCb | None = None,
) -> dict[str, dict[str, Any]]:
    """Evaluate every shortlisted job. Returns {job_id: eval}. Failed jobs omitted.

    `on_progress(done, total, job)` fires once per job as its eval lands (in
    completion order) — powers the ADR-0009 per-job refresh reveal. Best-effort:
    a raising callback never breaks ranking.
    """
    system_prompt = build_system_prompt(profile, profile.get("cv_markdown") or "")
    sem = asyncio.Semaphore(_CONCURRENCY)
    total = len(top_jobs)
    done = 0

    async def _one(job: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
        nonlocal done
        async with sem:
            ev = await evaluate_job(job, system_prompt, provider)
        done += 1  # single-threaded event loop → increment is atomic
        if on_progress is not None:
            try:
                on_progress(done, total, job)
            except Exception:
                logger.warning("rank on_progress callback failed", exc_info=True)
        return str(job["job_id"]), ev

    results = await asyncio.gather(*(_one(j) for j in top_jobs))
    return {jid: ev for jid, ev in results if ev is not None}


# ── Persist ───────────────────────────────────────────────────────────────────

def persist_matches(
    db: Client,
    user_id: str,
    batch_week: date,
    top_jobs: list[dict],
    evaluations: dict[str, dict],
    profile: dict[str, Any] | None = None,
) -> int:
    """Upsert the user's Job Matches to user_job_matches. Returns count written.

    Backlog #36 (de-weekly): one permanent row per (user, job) — a re-eval
    upserts in place. `batch_week` still rides in each row for provenance, but is
    NOT part of the identity (migration 20260710).

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

    from app.services.match_credibility import evaluate_credibility

    profile = profile or {}
    baseline_version_id = profile.get("baseline_version_id")
    rows: list[dict] = []
    recommended_count = 0
    for rank_idx, job in enumerate(ordered, start=1):
        jid = str(job["job_id"])
        ev = evaluations.get(jid) or {}
        overall = ev.get("overall_score")
        recommendation = ev.get("recommendation")
        credibility = evaluate_credibility(profile, job, overall, recommendation)
        is_recommended = credibility.credible and recommended_count < 3
        if is_recommended:
            recommended_count += 1
        rows.append({
            "user_id": user_id,
            "job_id": jid,
            "batch_week": str(batch_week),
            "overlap_score": job["overlap_score"],
            "matched_skills": job.get("matched_skills") or [],
            "missing_skills": job.get("missing_skills") or [],
            "llm_rank": rank_idx,
            "llm_explanation": ev.get("summary"),
            "overall_score": overall,
            "grade": ev.get("grade"),
            "recommendation": credibility.recommendation,
            "application_angle": ev.get("application_angle"),
            "summary": ev.get("summary"),
            "role_fit": ev.get("role_fit"),
            "comp_fit": ev.get("comp_fit"),
            "growth_fit": ev.get("growth_fit"),
            "culture_fit": ev.get("culture_fit"),
            "risk_score": ev.get("risk_score"),
            "strengths": ev.get("strengths") or [],
            "concerns": ev.get("concerns") or [],
            "archetype": ev.get("archetype"),
            "legitimacy_tier": ev.get("legitimacy_tier"),
            "legitimacy_reason": ev.get("legitimacy_reason"),
            "is_recommended": is_recommended,
            "baseline_version_id": baseline_version_id,
            "target_context_hash": credibility.context_hash,
            "seniority_compatibility": credibility.seniority_compatibility,
            "computed_at": now,
        })

    if rows:
        # Permanent per-(user,job) identity (Backlog #36 de-weekly; migration
        # 20260710) — re-evaluating a job upserts the same row instead of
        # stacking a duplicate per week.
        db.table("user_job_matches").upsert(
            rows, on_conflict="user_id,job_id"
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
    on_progress: RankProgressCb | None = None,
) -> int:
    """Full Stage-2 pipeline: per-job 5-axis eval → persist. Returns rows written."""
    if not top_jobs:
        return 0

    evaluations = await evaluate_all(profile, top_jobs, provider, on_progress)
    if not evaluations:
        logger.warning(
            "Matching Brain: all evals failed for user %s — storing overlap scores only",
            user_id,
        )
    return persist_matches(db, user_id, batch_week, top_jobs, evaluations, profile)
