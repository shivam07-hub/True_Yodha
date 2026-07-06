"""
services/matching/on_demand.py — brain-on-open (Consolidation D).

When a user opens (or saves) a job ANYWHERE, we want the Matching Brain's verdict
on it — but never a per-request bulk LLM call. This runs the brain for ONE job,
exactly once, and caches the result into `user_job_matches` so every later read
(the feed JOIN, the drawer, the dashboard) is free.

Reuses the JobRanking facade (`ranking.rank_one`) for the eval and the same
credibility gate + row shape as the weekly persister — the only difference is the
row is written with `is_recommended=False` (opening a job must not promote it into
the user's top-3 recommended set).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.services import job_matcher
from app.services.llm_provider import LLMProvider
from app.services.match_credibility import evaluate_credibility
from app.services.matching import ranking

logger = logging.getLogger(__name__)

# Display subset the frontend patches onto its local job object.
_BRAIN_FIELDS = (
    "overall_score", "grade", "recommendation", "summary", "application_angle",
    "role_fit", "comp_fit", "growth_fit", "culture_fit", "risk_score",
    "strengths", "concerns", "archetype", "legitimacy_tier", "legitimacy_reason",
)


def _brain_result(src: dict[str, Any], *, cached: bool) -> dict[str, Any]:
    """The display subset, with strengths/concerns coerced to lists (a cached DB
    row may store them NULL) so the response model never chokes on None."""
    out = {k: src.get(k) for k in _BRAIN_FIELDS}
    out["strengths"] = list(out.get("strengths") or [])
    out["concerns"] = list(out.get("concerns") or [])
    out["cached"] = cached
    return out


def _shape_single_job(
    meta: dict[str, Any], job_skill_rows: list[dict[str, Any]], user_skill_map: dict[str, int]
) -> dict[str, Any]:
    """Build the get_top_matches-shaped dict for ONE job, bypassing the overlap
    floor (a user may open a job that shares zero CV skills — still brain it).
    Mirrors job_matcher's weighting via its shared constants so the number can't
    drift from the batch path."""
    user_lower = {k.lower() for k in user_skill_map}
    main: list[str] = []
    side: list[str] = []
    for row in job_skill_rows:
        key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
        if not key:
            continue
        (main if row.get("is_primary") else side).append(key)

    matched = [s for s in main + side if s.lower() in user_lower]
    missing = [s for s in main + side if s.lower() not in user_lower][: job_matcher.MAX_MISSING_SKILLS]
    max_possible = job_matcher.PRIMARY_WEIGHT * len(main) + job_matcher.SECONDARY_WEIGHT * len(side)
    hit = (
        job_matcher.PRIMARY_WEIGHT * len([s for s in main if s.lower() in user_lower])
        + job_matcher.SECONDARY_WEIGHT * len([s for s in side if s.lower() in user_lower])
    )
    overlap = round(hit / max_possible * 100, 1) if max_possible else 0.0
    return {
        "job_id": str(meta["job_id"]),
        "title": meta.get("job_title") or "",
        "company": meta.get("company_name"),
        "industry": meta.get("industry"),
        "location": meta.get("location"),
        "description": (meta.get("job_description") or "")[:800],
        "matched_skills": list(dict.fromkeys(matched)),
        "missing_skills": missing,
        "overlap_score": overlap,
    }


async def ensure_job_eval(
    repo: Any,
    provider: LLMProvider,
    user_id: str,
    job_id: str,
) -> dict[str, Any] | None:
    """Return the brain eval for one job, computing + caching it once if absent.

    Idempotent: a job that already has a cached eval (from a prior refresh or a
    prior open) returns it with ``cached=True`` and never calls the LLM. Returns
    ``None`` if the job doesn't exist or the brain fails (the caller keeps showing
    deterministic overlap — degradation, not an error)."""
    jid = str(job_id)
    cached = repo.get_cached_match_evals(user_id, [jid], full=True).get(jid)
    if cached and cached.get("overall_score") is not None:
        return _brain_result(cached, cached=True)

    meta_rows = repo.get_jobs_by_ids([jid])
    if not meta_rows:
        return None

    skill_rows = repo.get_user_skill_rows(user_id)
    user_skill_map: dict[str, int] = {
        row["skills"]["taxonomy_key"]: row["matched_level"]
        for row in skill_rows
        if row.get("skills")
    }
    job_skill_rows = repo.get_all_job_skill_rows(job_ids=[jid])
    shaped = _shape_single_job(meta_rows[0], job_skill_rows, user_skill_map)

    profile = repo.get_user_profile_targeting(user_id)
    if hasattr(repo, "get_latest_baseline_id"):
        profile["baseline_version_id"] = repo.get_latest_baseline_id(user_id)

    ev = await ranking.rank_one(profile, profile.get("cv_markdown") or "", shaped, provider)
    if ev is None:
        logger.info("on_demand brain: eval failed/unavailable for job=%s", jid)
        return None

    _persist(repo, user_id, shaped, profile, ev)
    return _brain_result(ev, cached=False)


def _persist(
    repo: Any, user_id: str, shaped: dict[str, Any], profile: dict[str, Any], ev: dict[str, Any]
) -> None:
    """Write ONE user_job_matches row, is_recommended=False. Same shape + conflict
    key as llm_ranker.persist_matches so downstream reads are uniform; the only
    divergence is no top-3 promotion (opening a job must not recommend it)."""
    from app.routers.jobs._shared import last_monday  # local import: avoid service→router load cycle

    credibility = evaluate_credibility(profile, shaped, ev.get("overall_score"), ev.get("recommendation"))
    row = {
        "user_id": user_id,
        "job_id": shaped["job_id"],
        "batch_week": str(last_monday()),
        "overlap_score": shaped["overlap_score"],
        "matched_skills": shaped.get("matched_skills") or [],
        "missing_skills": shaped.get("missing_skills") or [],
        "llm_rank": None,
        "llm_explanation": ev.get("summary"),
        "overall_score": ev.get("overall_score"),
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
        "is_recommended": False,
        "baseline_version_id": profile.get("baseline_version_id"),
        "target_context_hash": credibility.context_hash,
        "seniority_compatibility": credibility.seniority_compatibility,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    repo.upsert_single_match_eval(user_id, row)
