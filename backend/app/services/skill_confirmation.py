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
from app.services.experience_years import seniority_from_cv


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
    """Publish reviewed skills, then score them. Returns `{next, total_score}`.

    `next` is the step the user goes to, decided by whether they have a direction
    yet — NOT by whether a score came back. Those two were the same question while
    a score only existed after a direction was chosen; now that the score is
    computed here, conflating them would route every first-run user past the
    direction step.
    """
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

    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
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
        return {"next": "shortlist_processing", "total_score": float(score["total_score"])}

    # No direction yet — but the score does not need one. `total_score` is a
    # function of the confirmed skills and the seniority band alone; the chosen
    # role family and cities move the GAP list, never the number. Waiting for the
    # direction step meant the score started computing when the user arrived at
    # step 3 and then made them watch it, which is the whole of the reported
    # "Calculating your Myro Score" wait.
    #
    # The band comes from the CV, via the same reader that pre-fills the answer on
    # the direction step — so for a user who accepts what Myro read (the common
    # case) this score is already final, not a placeholder that will shift under
    # them. If they change the level, `onboarding_target_refresh` recomputes; the
    # row exists by then either way, so step 3 no longer blocks on it.
    _persist_cv_seniority(users_repo, user_id, profile, baseline)
    score = scoring.recompute_score(scores_repo, user_id)
    return {"next": "target", "total_score": float(score["total_score"])}


def _persist_cv_seniority(
    users_repo: UsersRepository,
    user_id: str,
    profile: dict[str, Any],
    baseline: dict[str, Any],
) -> None:
    """Write the band read from the CV, so the pre-target score is banded honestly.

    Only fills an EMPTY value — a user who already chose a level owns it, and this
    must never overwrite that. When the CV says nothing, nothing is written and
    scoring falls back to its entry-band default rather than a guess.
    """
    if profile.get("target_seniority"):
        return
    suggestion = seniority_from_cv(baseline)
    if not suggestion.get("value"):
        return
    users_repo.update_profile(user_id, {"target_seniority": suggestion["value"]})
