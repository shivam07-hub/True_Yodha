"""
services/matching/on_demand.py — brain-on-open (Consolidation D).

When a user opens (or saves) a job ANYWHERE, we want the Matching Brain's verdict
on it — but never a per-request bulk LLM call. This runs the brain for ONE job,
exactly once, and caches the result into `user_job_matches` so every later read
(the feed JOIN, the drawer, the dashboard) is free.

Reuses the JobRanking facade (`ranking.rank_one`) for the eval and the same
credibility gate + row shape as the batch persister — the only difference is the
row is written with `is_recommended=False` (opening a job must not promote it into
the user's top-3 recommended set).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.services.job_projection import last_monday
from app.services import background, job_matcher, onboarding_service
from app.services.llm_provider import LLMProvider, get_judgment_provider
from app.services.match_credibility import evaluate_credibility
from app.services.matching import ranking, targeting

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

    Calls job_matcher's scoring rather than reimplementing it. This used to
    mirror the weight constants with a comment hoping the number would not
    drift from the batch path; a shared function is what makes that true.
    """
    user_lower = {k.lower(): v for k, v in user_skill_map.items()}
    wanted = job_matcher.wanted_skills(job_skill_rows)
    overlap, matched, missing = job_matcher.score_wanted(wanted, user_lower)
    missing = missing[: job_matcher.MAX_MISSING_SKILLS]
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


def _ranking_profile(repo: Any, user_id: str) -> dict[str, Any]:
    profile = targeting.for_ranking(repo, user_id).ranking_profile()
    if hasattr(repo, "get_latest_baseline_id"):
        profile["baseline_version_id"] = repo.get_latest_baseline_id(user_id)
    return profile


def stored_job_eval(repo: Any, user_id: str, job_id: str) -> dict[str, Any] | None:
    """Durable Answer for one job. Never a model."""
    result, _profile = _stored_job_eval(repo, user_id, job_id)
    return result


def _stored_job_eval(
    repo: Any, user_id: str, job_id: str
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    jid = str(job_id)
    cached = repo.get_cached_match_evals(user_id, [jid], full=True).get(jid)

    # The Targeting Brief, not the raw profile columns: a verdict computed here is
    # cached permanently per (user, job), so reading only `user_profiles` would make
    # every fact the user has told Myro invisible to it forever. Read BEFORE the
    # cache decision because the decision needs the key — one small indexed
    # user_memory read per open, against an LLM call when it misses.
    profile = _ranking_profile(repo, user_id)
    eval_ctx = onboarding_service.eval_context_key(profile)

    # A cached verdict counts only if it carries a real score AND was reasoned from
    # what we believe NOW. "Rated once, ever" was the rule; it meant a verdict
    # computed before the user told Myro anything could never be revisited. Same
    # key, still free; different key, re-rate — the cost lands only where the
    # inputs actually moved. A score-less row is a Provisional Match, not a
    # verdict, and always computes.
    if (
        cached
        and cached.get("overall_score") is not None
        and onboarding_service.eval_matches_context(cached, eval_ctx)
    ):
        return _brain_result(cached, cached=True), profile
    return None, profile


def enqueue_job_eval(user_id: str, job_id: str) -> None:
    if not background.claim(f"brain:{user_id}:{job_id}", 120):
        return
    background.enqueue(
        background.LANE_FAST,
        "job_brain_eval",
        payload={"user_id": user_id, "job_id": str(job_id)},
        correlation_id=f"brain:{user_id}:{job_id}",
    )


def open_job_eval(repo: Any, user_id: str, job_id: str) -> dict[str, Any] | None:
    """Return the stored verdict, or enqueue the write and return None.

    Opening a job may start a named write. It must not wait on a model.
    """
    stored = stored_job_eval(repo, user_id, job_id)
    if stored is not None:
        return stored
    enqueue_job_eval(user_id, job_id)
    return None


async def ensure_job_eval(
    repo: Any,
    provider: LLMProvider,
    user_id: str,
    job_id: str,
) -> dict[str, Any] | None:
    """Compute + cache the brain eval for one job if it is not already stored.

    The HTTP open path uses ``open_job_eval``. This is the named write the
    worker runs. Returns ``None`` if the job doesn't exist or the brain fails
    (the caller keeps showing deterministic overlap — degradation, not an error).
    """
    stored, profile = _stored_job_eval(repo, user_id, job_id)
    if stored is not None:
        return stored

    jid = str(job_id)
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

    ev = await ranking.rank_one(profile, profile.get("cv_markdown") or "", shaped, provider)
    if ev is None:
        logger.info("on_demand brain: eval failed/unavailable for job=%s", jid)
        return None

    _persist(repo, user_id, shaped, profile, ev)
    return _brain_result(ev, cached=False)


@background.handler("job_brain_eval")
async def _job_brain_eval_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    from app.database import get_supabase_admin
    from app.repositories.jobs import JobsRepository

    user_id = payload["user_id"]
    job_id = str(payload["job_id"])
    db = get_supabase_admin()
    repo = JobsRepository(db, db)
    result = await ensure_job_eval(repo, get_judgment_provider(), user_id, job_id)
    if result is None and allow_retry and repo.get_jobs_by_ids([job_id]):
        raise background.TransientJobError("job_brain_eval_unavailable")


def _persist(
    repo: Any, user_id: str, shaped: dict[str, Any], profile: dict[str, Any], ev: dict[str, Any]
) -> None:
    """Write ONE user_job_matches row, is_recommended=False. Same shape + conflict
    key as llm_ranker.persist_matches so downstream reads are uniform; the only
    divergence is no top-3 promotion (opening a job must not recommend it)."""

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
        "eval_context_hash": onboarding_service.eval_context_key(profile),
        "seniority_compatibility": credibility.seniority_compatibility,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    repo.upsert_single_match_eval(user_id, row)
