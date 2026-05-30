from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

from app.repositories.jobs import JobsRepository
from app.repositories.scores import ScoresRepository
from app.services import job_importer, job_matcher, llm_ranker
from app.services.llm_provider import LLMProvider
from app.services.scoring.aspirations import fetch_aspiration_skills

logger = logging.getLogger(__name__)


OutcomeKind = Literal[
    "written",
    "cache_hit",
    "exhausted",
    "needs_onboarding",
]


@dataclass(frozen=True)
class MatchComputeOutcome:
    """Typed result of `compute_job_matches`. Replaces the legacy 6-key dict.

    `should_charge_xp` is the single authority — callers no longer guess at
    `matches_written > 0` themselves.
    """
    kind: OutcomeKind
    matches_written: int
    batch_week: date
    debug: dict[str, Any] = field(default_factory=dict)

    @property
    def should_charge_xp(self) -> bool:
        return self.kind == "written" and self.matches_written > 0

    @property
    def from_cache(self) -> bool:
        return self.kind == "cache_hit"

    @property
    def exhausted(self) -> bool:
        return self.kind == "exhausted"

    @property
    def needs_onboarding(self) -> bool:
        return self.kind == "needs_onboarding"


def build_user_skill_demand(
    repo: JobsRepository,
    user_id: str,
) -> list[dict[str, Any]]:
    if hasattr(repo, "get_user_skill_demand_snapshot"):
        items = list(repo.get_user_skill_demand_snapshot(user_id))
    else:
        # Backward-compatible fallback for seam tests and lightweight fakes.
        user_skills: dict[str, dict[str, Any]] = {}
        for row in repo.get_user_skills_with_taxonomy(user_id):
            skill = row.get("skills")
            if not skill:
                continue
            key = (skill.get("taxonomy_key") or "").strip()
            if not key:
                continue
            user_skills[key.lower()] = {
                "skill": key,
                "display_name": (skill.get("display_name") or key).strip() or key,
                "current_level": int(row.get("matched_level") or 0),
                "proficiency_title": row.get("proficiency_title") or "Scout",
            }

        if not user_skills:
            return []

        weighted_demand: dict[str, int] = {}
        job_count: dict[str, int] = {}
        for row in repo.get_all_jobs_skills():
            seen_in_job: set[str] = set()

            for raw_skill in row.get("main_skills") or []:
                skill_key = (raw_skill or "").strip().lower()
                if skill_key and skill_key in user_skills:
                    weighted_demand[skill_key] = weighted_demand.get(skill_key, 0) + 2
                    seen_in_job.add(skill_key)

            for raw_skill in row.get("side_skills") or []:
                skill_key = (raw_skill or "").strip().lower()
                if skill_key and skill_key in user_skills:
                    weighted_demand[skill_key] = weighted_demand.get(skill_key, 0) + 1
                    seen_in_job.add(skill_key)

            for skill_key in seen_in_job:
                job_count[skill_key] = job_count.get(skill_key, 0) + 1

        items = []
        for skill_key, skill_meta in user_skills.items():
            items.append(
                {
                    **skill_meta,
                    "job_count_30d": job_count.get(skill_key, 0),
                    "weighted_demand": weighted_demand.get(skill_key, 0),
                }
            )

    if not items:
        return []

    target_roles = repo.get_user_target_roles(user_id)
    aspiration = fetch_aspiration_skills(ScoresRepository(repo.client), target_roles)
    aspiration_by_key = {key.lower(): level for key, level in aspiration.items()}

    # Market-demand fallback (mirrors gap.py:42-48). When aspiration is empty
    # (e.g. all target roles exhausted retries upstream), target_level=current+1
    # for every skill with non-zero market demand. Without this, the Skills page
    # silently loses every needs_upgrade badge — exactly the silent-degradation
    # class beta-3 surfaced.
    fallback_active = not aspiration_by_key

    enriched_items: list[dict[str, Any]] = []
    for item in items:
        skill_key = str(item.get("skill") or "").strip().lower()
        current_level = int(item.get("current_level") or 0)
        target_level = aspiration_by_key.get(skill_key)
        if target_level is None and fallback_active and current_level < 5:
            if int(item.get("weighted_demand") or 0) > 0:
                target_level = current_level + 1
        enriched_items.append(
            {
                **item,
                "target_level": target_level,
                "needs_upgrade": target_level is not None and current_level < target_level,
            }
        )

    enriched_items.sort(
        key=lambda item: (
            -item["weighted_demand"],
            -item["job_count_30d"],
            -item["current_level"],
            str(item["display_name"]).lower(),
        )
    )
    return enriched_items


async def compute_job_matches(
    repo: JobsRepository,
    user_id: str,
    batch_week: date,
    llm_provider: LLMProvider,
    excluded_job_ids: list[str] | None = None,
    force: bool = False,
) -> MatchComputeOutcome:
    """Compute and persist the user's weekly Job Matches.

    No cooldown — XP economy gates concurrency at the Job Refresh seam.
    See CONTEXT.md "Job Refresh" for the policy decision.

    `force=True` skips the weekly cache short-circuit: a paid Refresh always
    re-runs the brain (the user chose to spend XP). The free CV-upload initial
    compute leaves `force=False` so it never re-charges work already done.
    """
    db = repo.client

    if not force and llm_ranker.is_cache_valid(db, user_id, batch_week):
        return MatchComputeOutcome(
            kind="cache_hit",
            matches_written=0,
            batch_week=batch_week,
            debug={"cache_hit": True, "candidate_jobs_count": None},
        )

    skill_rows = repo.get_user_skill_rows(user_id)
    if not skill_rows:
        return MatchComputeOutcome(
            kind="needs_onboarding",
            matches_written=0,
            batch_week=batch_week,
            debug={
                "user_skills_count": 0,
                "candidate_jobs_count": 0,
                "top_jobs_count": 0,
                "target_roles_count": 0,
            },
        )

    user_skill_map: dict[str, int] = {
        row["skills"]["taxonomy_key"]: row["matched_level"]
        for row in skill_rows
        if row.get("skills")
    }
    profile = repo.get_user_profile_targeting(user_id)
    target_roles_count = len(profile.get("target_roles") or [])
    candidate_job_ids = repo.get_candidate_job_ids_for_skills(
        list(user_skill_map.keys()),
        target_location_country=profile.get("target_location_country"),
    )

    # Self-healing exclusion (Backlog #14 / 2026-05-30 decision: refresh is
    # gated only by XP). `excluded_job_ids` is a *novelty preference*, not a
    # hard wall: prefer jobs the user hasn't matched yet, but if excluding the
    # prior matches empties the pool, re-rank the FULL pool rather than refund.
    # The only genuine `exhausted` is zero skill-overlapping jobs at all.
    full_pool = candidate_job_ids
    exclusion_relaxed = False
    if excluded_job_ids:
        excluded_set = set(excluded_job_ids)
        filtered = [jid for jid in candidate_job_ids if jid not in excluded_set]
        if filtered:
            candidate_job_ids = filtered
        else:
            # Prior matches consumed the whole pool — the user paid, so give
            # them a freshly-ranked set from everything that overlaps.
            exclusion_relaxed = True

    if not candidate_job_ids:
        logger.info("compute_job_matches: pool exhausted for user=%s", user_id)
        return MatchComputeOutcome(
            kind="exhausted",
            matches_written=0,
            batch_week=batch_week,
            debug={
                "user_skills_count": len(user_skill_map),
                "candidate_jobs_count": 0,
                "top_jobs_count": 0,
                "target_roles_count": target_roles_count,
                "exclusion_relaxed": int(exclusion_relaxed),
            },
        )

    job_skill_rows = repo.get_all_job_skill_rows(job_ids=candidate_job_ids)
    match_debug: dict[str, int] = {}
    top_jobs = job_matcher.get_top_matches(
        job_skill_rows,
        user_skill_map,
        job_meta_fetcher=repo.get_jobs_by_ids,
        target_roles=profile.get("target_roles") or [],
        top_n=12,
        debug=match_debug,
    )
    logger.info(
        "compute_job_matches: user=%s skills=%d candidates=%d top_jobs=%d",
        user_id, len(user_skill_map), len(candidate_job_ids), len(top_jobs),
    )
    if not top_jobs:
        return MatchComputeOutcome(
            kind="exhausted",
            matches_written=0,
            batch_week=batch_week,
            debug={
                "user_skills_count": len(user_skill_map),
                "candidate_jobs_count": len(candidate_job_ids),
                "top_jobs_count": 0,
                "target_roles_count": target_roles_count,
                "exclusion_relaxed": int(exclusion_relaxed),
                **match_debug,
            },
        )

    written = await llm_ranker.rank_and_persist(
        db, user_id, batch_week, profile, top_jobs, llm_provider
    )
    return MatchComputeOutcome(
        kind="written",
        matches_written=written,
        batch_week=batch_week,
        debug={
            "user_skills_count": len(user_skill_map),
            "candidate_jobs_count": len(candidate_job_ids),
            "top_jobs_count": len(top_jobs),
            "target_roles_count": target_roles_count,
            "exclusion_relaxed": int(exclusion_relaxed),
            **match_debug,
        },
    )


def preview_imported_job(repo: JobsRepository, body: Any) -> dict[str, Any]:
    return job_importer.preview_imported_job(repo.client, body)


def save_imported_job(repo: JobsRepository, user_id: str, body: Any) -> dict[str, Any]:
    return job_importer.save_imported_job(repo.client, user_id, body)
