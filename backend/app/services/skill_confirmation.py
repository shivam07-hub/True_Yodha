"""Publish reviewed baseline skills, then unlock scoring and matching."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.repositories.cv import CVVersionsRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.scores import ScoresRepository
from app.repositories.users import UsersRepository
from app.services import background, scoring


_REMOVED_BY_USER = "User removed this extracted CV skill."


def _normalized_overrides(
    scores_repo: ScoresRepository,
    overrides: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Collapse to one ruling per skill, resolving key-identified items to ids.

    Callers may name a skill by ``taxonomy_key`` instead of ``skill_id``; keys
    that are not in the catalog are dropped rather than raising, because they
    would also be dropped by the publish path — an unresolvable skill cannot be
    included, and excluding one is already the outcome.
    """
    by_skill: dict[int, dict[str, Any]] = {}
    for item in overrides:
        raw_id = item.get("skill_id")
        if raw_id is None:
            key = str(item.get("taxonomy_key") or "").strip()
            resolved = scores_repo.get_skill_id_for_key(key) if key else None
            if resolved is None:
                continue
            skill_id = resolved
        else:
            skill_id = int(raw_id)
        evidence = str(item.get("evidence_text") or "").strip()
        by_skill[skill_id] = {
            "skill_id": skill_id,
            "action": item["action"],
            "evidence_text": evidence or _REMOVED_BY_USER,
            "source_location": item.get("source_location") or {},
        }
    return list(by_skill.values())


def _reviewed_rows(
    base_rows: list[dict[str, Any]],
    overrides: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = {
        int(row["skill_id"]): {
            "skill_id": int(row["skill_id"]),
            "matched_level": int(row["matched_level"]),
            "proficiency_title": str(row["proficiency_title"]),
            "source": "cv",
            "evidence_text": str(row.get("evidence_text") or ""),
        }
        for row in base_rows
    }
    for item in overrides:
        skill_id = int(item["skill_id"])
        if item["action"] == "exclude":
            rows.pop(skill_id, None)
        else:
            rows[skill_id] = {
                "skill_id": skill_id,
                "matched_level": 1,
                "proficiency_title": "Scout",
                "source": "user_override",
                "evidence_text": item["evidence_text"],
            }
    return list(rows.values())


def confirm_baseline_skills(
    db: Client,
    user_id: str,
    baseline_version_id: int,
    overrides: list[dict[str, Any]],
) -> dict[str, Any]:
    """Atomically publish reviewed skills before computing any derived result."""
    cv_repo = CVVersionsRepository(db)
    baseline = cv_repo.find(baseline_version_id, user_id)
    latest = cv_repo.latest_baseline(user_id)
    if (
        not baseline
        or baseline.get("kind") != "baseline_upload"
        or not latest
        or int(latest["id"]) != baseline_version_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Confirm the latest baseline CV.",
        )

    signals = baseline.get("skills_detected") or []
    scores_repo = ScoresRepository(db)
    base_rows = scoring.build_cv_skill_rows(scores_repo, user_id, signals)
    normalized = _normalized_overrides(scores_repo, overrides)
    reviewed = _reviewed_rows(base_rows, normalized)
    if not reviewed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Keep at least one evidence-backed skill.",
        )

    cv_repo.confirm_skills(user_id, baseline_version_id, reviewed, normalized)

    profile = UsersRepository(db).get_profile(user_id) or {}
    has_target = bool(
        profile.get("target_role_title") or profile.get("target_role_titles")
    )
    OnboardingRepository(db).patch_state(
        user_id,
        {"status": "analyzing" if has_target else "result_ready", "current_stage": "result"},
    )
    if has_target:
        score = scoring.recompute_score(scores_repo, user_id)
        background.enqueue(
            background.LANE_FAST,
            "onboarding_target_refresh",
            payload={"user_id": user_id, "score_fresh": True},
            correlation_id=f"confirmed-skills:{user_id}:{baseline_version_id}",
        )
        return score
    return {}
