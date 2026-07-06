"""
services/matching/ranking.py — the JobRanking facade.

ONE entry point for "given a candidate pool + a targeting profile, produce ranked
jobs (deterministic overlap, optionally brain-scored)". It DELEGATES to the two
tuned stages — it never reimplements them:

  - Stage 1 (deterministic): ``job_matcher.get_top_matches`` — skill overlap +
    role boost + company cap.
  - Stage 2 (brain): ``llm_ranker.evaluate_all`` — the Career-Ops 5-axis eval +
    grade + Apply/Negotiate/Skip verdict + legitimacy tier + archetype
    (Consolidation A).

Callers:
  - ``jobs_workflow.compute_job_matches`` (the weekly batch / paid Refresh) routes
    through ``rank()`` — behaviour-identical to the old inline get_top_matches +
    rank_and_persist duo.
  - Consolidation D (a job opened/saved anywhere) routes through ``rank_one()`` for
    a single on-demand brain eval, then caches it into ``user_job_matches``.

This module writes nothing — persistence stays in ``llm_ranker.persist_matches``.
See CONTEXT.md "JobRanking".
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.services import job_matcher, llm_ranker
from app.services.llm_provider import LLMProvider
from app.services.llm_ranker import RankProgressCb

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RankCandidates:
    """Raw inputs to the deterministic overlap stage (Stage 1).

    Bundles what ``job_matcher.get_top_matches`` needs so ``rank`` keeps the locked
    ``rank(profile, cv, jobs, ...)`` shape without a long positional tail.
    """

    job_skill_rows: list[dict[str, Any]]
    user_skill_map: dict[str, int]
    job_meta_fetcher: Callable[[list[str]], list[dict[str, Any]]]
    top_n: int = 12


@dataclass(frozen=True)
class RankResult:
    """Deterministic shortlist + optional brain evals keyed by job_id.

    ``evaluations`` is empty when the brain is skipped (``use_brain=False`` /
    ``provider is None``) or every eval failed — the deterministic scores still
    stand on their own, exactly as the old ``persist_matches`` fallback assumed.
    """

    top_jobs: list[dict[str, Any]] = field(default_factory=list)
    evaluations: dict[str, dict[str, Any]] = field(default_factory=dict)


async def rank(
    profile: dict[str, Any],
    cv_markdown: str,
    jobs: RankCandidates,
    *,
    provider: LLMProvider | None = None,
    use_brain: bool = True,
    budget: int | None = None,
    on_progress: RankProgressCb | None = None,
    debug: dict[str, int] | None = None,
) -> RankResult:
    """Deterministic overlap → (optional) brain. Pure compute, no DB writes.

    ``use_brain=False`` or ``provider is None`` → deterministic-only (overlap
    scores, no evals). ``budget`` caps how many of the shortlist reach the brain
    (cost control for on-demand callers); ``None`` = brain every shortlisted job,
    which is the weekly-batch behaviour.
    """
    top_jobs = job_matcher.get_top_matches(
        jobs.job_skill_rows,
        jobs.user_skill_map,
        job_meta_fetcher=jobs.job_meta_fetcher,
        target_roles=profile.get("target_roles") or [],
        top_n=jobs.top_n,
        debug=debug,
    )
    if not top_jobs or not use_brain or provider is None:
        return RankResult(top_jobs=top_jobs, evaluations={})

    brain_jobs = top_jobs if budget is None else top_jobs[: max(0, budget)]
    eval_profile = _eval_profile(profile, cv_markdown)
    evaluations = await llm_ranker.evaluate_all(eval_profile, brain_jobs, provider, on_progress)
    if not evaluations:
        logger.warning("JobRanking: all brain evals failed — deterministic scores only")
    return RankResult(top_jobs=top_jobs, evaluations=evaluations)


async def rank_one(
    profile: dict[str, Any],
    cv_markdown: str,
    job: dict[str, Any],
    provider: LLMProvider,
) -> dict[str, Any] | None:
    """On-demand single-job brain (Consolidation D: a job opened/saved anywhere).

    ``job`` is a ``get_top_matches``-shaped dict (title/company/industry/location/
    description/matched_skills/overlap_score). Returns a ``parse_eval()`` dict or
    ``None`` on provider/parse failure. NOT a per-request bulk path — callers cache
    the result into ``user_job_matches`` so the brain runs once per job, not once
    per view.
    """
    eval_profile = _eval_profile(profile, cv_markdown)
    system_prompt = llm_ranker.build_system_prompt(eval_profile, eval_profile["cv_markdown"])
    return await llm_ranker.evaluate_job(job, system_prompt, provider)


def _eval_profile(profile: dict[str, Any], cv_markdown: str) -> dict[str, Any]:
    """Ensure the brain prompt sees a CV — the facade's explicit ``cv`` wins, else
    fall back to whatever the profile already carried (behaviour-identical to the
    old path, where ``evaluate_all`` read ``profile['cv_markdown']``)."""
    return {**profile, "cv_markdown": cv_markdown or profile.get("cv_markdown") or ""}
