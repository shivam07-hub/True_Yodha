from __future__ import annotations

import logging
from datetime import date
from typing import Any

from app.repositories.jobs import JobsRepository
from app.repositories.scores import ScoresRepository
from app.services import job_importer, job_matcher, job_path as job_path_service, llm_ranker
from app.services.llm_provider import LLMProvider
from app.services.rate_limit import assert_not_rate_limited
from app.services.scoring import fetch_aspiration_skills

logger = logging.getLogger(__name__)


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

    enriched_items: list[dict[str, Any]] = []
    for item in items:
        skill_key = str(item.get("skill") or "").strip().lower()
        current_level = int(item.get("current_level") or 0)
        target_level = aspiration_by_key.get(skill_key)
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
) -> dict[str, Any]:
    db = repo.client
    assert_not_rate_limited(db, user_id, "user_job_matches", "computed_at")

    if llm_ranker.is_cache_valid(db, user_id, batch_week):
        return {
            "matches_written": 0,
            "from_cache": True,
            "batch_week": batch_week,
            "debug": {
                "cache_hit": True,
                "user_skills_count": None,
                "candidate_jobs_count": None,
                "top_jobs_count": None,
                "target_roles_count": None,
            },
        }

    skill_rows = repo.get_user_skill_rows(user_id)
    if not skill_rows:
        return {
            "matches_written": 0,
            "from_cache": False,
            "batch_week": batch_week,
            "needs_onboarding": True,
            "debug": {
                "cache_hit": False,
                "user_skills_count": 0,
                "candidate_jobs_count": 0,
                "top_jobs_count": 0,
                "target_roles_count": 0,
            },
        }

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
    if not candidate_job_ids:
        logger.warning(
            "compute_job_matches: no candidate jobs for user=%s skills=%d",
            user_id,
            len(user_skill_map),
        )
        return {
            "matches_written": 0,
            "from_cache": False,
            "batch_week": batch_week,
            "needs_onboarding": False,
            "debug": {
                "cache_hit": False,
                "user_skills_count": len(user_skill_map),
                "candidate_jobs_count": 0,
                "top_jobs_count": 0,
                "target_roles_count": target_roles_count,
            },
        }

    job_skill_rows = repo.get_all_job_skill_rows(job_ids=candidate_job_ids)
    top_jobs = job_matcher.get_top_matches(
        job_skill_rows,
        user_skill_map,
        job_meta_fetcher=repo.get_jobs_by_ids,
        target_roles=profile.get("target_roles") or [],
        top_n=10,
    )
    logger.info(
        "compute_job_matches: user=%s skills=%d candidates=%d target_roles=%d top_jobs=%d",
        user_id,
        len(user_skill_map),
        len(candidate_job_ids),
        target_roles_count,
        len(top_jobs),
    )
    if not top_jobs:
        return {
            "matches_written": 0,
            "from_cache": False,
            "batch_week": batch_week,
            "needs_onboarding": False,
            "debug": {
                "cache_hit": False,
                "user_skills_count": len(user_skill_map),
                "candidate_jobs_count": len(candidate_job_ids),
                "top_jobs_count": 0,
                "target_roles_count": target_roles_count,
            },
        }

    written = await llm_ranker.rank_and_persist(
        db,
        user_id,
        batch_week,
        user_skill_map,
        top_jobs,
        llm_provider,
    )
    return {
        "matches_written": written,
        "from_cache": False,
        "batch_week": batch_week,
        "debug": {
            "cache_hit": False,
            "user_skills_count": len(user_skill_map),
            "candidate_jobs_count": len(candidate_job_ids),
            "top_jobs_count": len(top_jobs),
            "target_roles_count": target_roles_count,
        },
    }


def preview_imported_job(repo: JobsRepository, body: Any) -> dict[str, Any]:
    return job_importer.preview_imported_job(repo.client, body)


def save_imported_job(repo: JobsRepository, user_id: str, body: Any) -> dict[str, Any]:
    return job_importer.save_imported_job(repo.client, user_id, body)


def get_application_path(repo: JobsRepository, user_id: str, job_id: str) -> dict[str, Any]:
    return job_path_service.get_application_path(repo.client, user_id, job_id)


def replace_skill_targets(
    repo: JobsRepository,
    user_id: str,
    job_id: str,
    targets: list[dict[str, Any]],
) -> dict[str, Any]:
    return job_path_service.replace_skill_targets(repo.client, user_id, job_id, targets)


def update_milestone(
    repo: JobsRepository,
    user_id: str,
    job_id: str,
    milestone_id: str,
    body: Any,
) -> dict[str, Any]:
    return job_path_service.update_milestone(repo.client, user_id, job_id, milestone_id, body)


async def generate_job_cv(
    repo: JobsRepository,
    user_id: str,
    job_id: str,
    ai_polish: bool,
    llm_provider: LLMProvider,
) -> dict[str, Any]:
    return await job_path_service.generate_job_cv(
        repo.client,
        user_id,
        job_id,
        ai_polish=ai_polish,
        provider=llm_provider,
    )
