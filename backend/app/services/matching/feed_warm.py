"""
services/matching/feed_warm.py — the /market feed shortlist warmer.

The "best jobs" rule: the career-ops brain ranks the top of the market feed, not
raw skill overlap. But LLM-ranking hundreds of roles per visit is cost-prohibitive
at scale, so the brain warms only the tight top shortlist (the fit-sorted first N)
and caches each eval into `user_job_matches`. The feed read then JOINs those cached
evals (Consolidation D) and orders the warmed set by the brain's verdict; the long
tail stays in the fast deterministic order.

This runs ONE batched brain pass (`llm_ranker.evaluate_all`) over the un-warmed
candidates, on the FREE interactive provider, and reuses the exact shape + persist
path as brain-on-open (`on_demand`) so a warmed row and an opened row are identical
downstream. Idempotent: a candidate that already has a cached eval is skipped, so a
re-warm inside the cache window costs nothing.

Fail-soft: any failure leaves the feed showing deterministic overlap (degradation,
not an error) — the caller never blocks a paint on the brain succeeding.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services import llm_ranker, onboarding_service
from app.services.llm_provider import LLMProvider
from app.services.matching import on_demand, ranking, targeting

logger = logging.getLogger(__name__)

# The shortlist depth — how many leading feed cards the brain ranks. Kept tight on
# purpose (CEO decision): a real "top picks" set, not the whole feed. Everything
# below stays fast deterministic overlap.
SHORTLIST_SIZE = 10


def _user_skill_map(skill_rows: list[dict[str, Any]]) -> dict[str, int]:
    """taxonomy_key → matched_level for the user's CV skills (matcher input)."""
    return {
        row["skills"]["taxonomy_key"]: row["matched_level"]
        for row in skill_rows
        if row.get("skills")
    }


def _group_skill_rows(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Bucket raw job_skills rows by job_id (fetch returns them ungrouped)."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        jid = str(row.get("job_id") or "")
        if jid:
            grouped.setdefault(jid, []).append(row)
    return grouped


async def warm_feed_shortlist(
    repo: Any,
    provider: LLMProvider,
    user_id: str,
    candidate_job_ids: list[str],
    *,
    limit: int = SHORTLIST_SIZE,
) -> int:
    """Brain-rank the top `limit` fit-sorted candidates that aren't cached yet.

    `candidate_job_ids` must arrive in the order the feed will show them (fit-sorted,
    top-of-page first) so the warmed set is exactly the cards the user sees first.
    Returns how many NEW evals were computed (0 if all cached or nothing to rank)."""
    ids = [str(j) for j in candidate_job_ids if j][:limit]
    if not ids:
        return 0
    from app.services.job_refresh._dispatch import user_has_live_refresh
    if user_has_live_refresh(user_id):
        logger.info("metric feed_warm.yielded user=%s stage=enter", user_id)
        return 0

    # The Targeting Brief, not the raw profile columns — same reason as on_demand:
    # these evals persist permanently per (user, job), so a memory-blind one here is
    # a memory-blind verdict forever.
    profile = targeting.for_ranking(repo, user_id).ranking_profile()
    if hasattr(repo, "get_latest_baseline_id"):
        profile["baseline_version_id"] = repo.get_latest_baseline_id(user_id)
    eval_ctx = onboarding_service.eval_context_key(profile)

    # Cached counts only if it was reasoned from what we believe NOW. A warm is
    # idempotent within a context and re-rates across one: the cost lands where the
    # targeting actually moved, not on every visit.
    cached = repo.get_cached_match_evals(user_id, ids)
    to_eval = [j for j in ids if not onboarding_service.eval_matches_context(cached.get(j), eval_ctx)]
    if not to_eval:
        return 0

    metas = {str(m["job_id"]): m for m in repo.get_jobs_by_ids(to_eval)}
    skill_rows_by_job = _group_skill_rows(repo.get_all_job_skill_rows(job_ids=to_eval))
    user_skill_map = _user_skill_map(repo.get_user_skill_rows(user_id))

    shaped: list[dict[str, Any]] = []
    for jid in to_eval:
        meta = metas.get(jid)
        if meta is None:
            continue
        shaped.append(
            on_demand._shape_single_job(meta, skill_rows_by_job.get(jid, []), user_skill_map)
        )
    if not shaped:
        return 0

    eval_profile = ranking._eval_profile(profile, profile.get("cv_markdown") or "")

    if user_has_live_refresh(user_id):
        logger.info("metric feed_warm.yielded user=%s stage=pre_eval", user_id)
        return 0

    evaluations = await llm_ranker.evaluate_all(eval_profile, shaped, provider)
    if not evaluations:
        logger.info("feed_warm: brain returned no evals for user=%s (%d candidates)", user_id, len(shaped))
        return 0

    shaped_by_id = {s["job_id"]: s for s in shaped}
    written = 0
    for jid, ev in evaluations.items():
        job = shaped_by_id.get(jid)
        if job is None or ev is None:
            continue
        on_demand._persist(repo, user_id, job, profile, ev)
        written += 1
    return written
