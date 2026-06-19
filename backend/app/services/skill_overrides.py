"""Apply explicit user skill interpretation without rewriting CV text."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.repositories.cv import CVVersionsRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.scores import ScoresRepository
from app.services import scoring


def apply_skill_overrides(
    db: Client,
    user_id: str,
    baseline_version_id: int,
    overrides: list[dict[str, Any]],
) -> dict[str, Any]:
    baseline = CVVersionsRepository(db).find(baseline_version_id, user_id)
    if not baseline or baseline.get("kind") != "baseline_upload":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Baseline CV not found.")

    current_rows = (
        db.table("user_skills")
        .select("skill_id")
        .eq("user_id", user_id)
        .execute()
    ).data or []
    effective_ids = {int(row["skill_id"]) for row in current_rows}
    for item in overrides:
        skill_id = int(item["skill_id"])
        if item["action"] == "exclude":
            effective_ids.discard(skill_id)
        else:
            effective_ids.add(skill_id)
    if not effective_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Keep at least one evidence-backed skill.",
        )

    repository = OnboardingRepository(db)
    repository.replace_skill_overrides(user_id, baseline_version_id, overrides)

    excluded = [int(item["skill_id"]) for item in overrides if item["action"] == "exclude"]
    included = [item for item in overrides if item["action"] == "include"]
    if excluded:
        (
            db.table("user_skills")
            .delete()
            .eq("user_id", user_id)
            .in_("skill_id", excluded)
            .execute()
        )
    if included:
        now = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                "user_id": user_id,
                "skill_id": int(item["skill_id"]),
                "matched_level": 1,
                "proficiency_title": "Scout",
                "source": "user_override",
                "evidence_text": item["evidence_text"],
                "last_updated": now,
            }
            for item in included
        ]
        db.table("user_skills").upsert(rows, on_conflict="user_id,skill_id").execute()

    scores_repo = ScoresRepository(db)
    return scoring.recompute_score(scores_repo, user_id)
