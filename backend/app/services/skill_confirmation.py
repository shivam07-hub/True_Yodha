"""Publish reviewed baseline skills, then unlock scoring and matching."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.repositories.cv import CVVersionsRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.scores import ScoresRepository
from app.repositories.users import UsersRepository
from app.services import onboarding_service, scoring
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
    """Publish reviewed skills and hand the score off. Returns `{next, result}`.

    `next` is the step the user goes to, decided by whether they have a direction
    yet — NOT by whether a score came back. Those two were the same question while
    a score only existed after a direction was chosen; conflating them would route
    every first-run user past the direction step.

    `result` is that step's full payload, produced by `get_result` — the same
    function the result screen reads, so there is exactly one definition of "what
    comes next". It is here because the client used to discard this response and
    immediately GET the same thing: measured on prod 2026-08-04, that was 8.4s of
    confirm followed by 8.2s of re-asking, 16.6s of dead time on one button press.
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

    # The band is written BEFORE the score is asked for, because it is an input to
    # it: `total_score` is a function of the confirmed skills and the seniority
    # band alone (the chosen role family and cities move the GAP list, never the
    # number). It comes from the CV via the same reader that pre-fills the answer
    # on the direction step, so for a user who accepts what Myro read — the common
    # case — the first score is already final, not a placeholder that shifts later.
    if not has_target:
        _persist_cv_seniority(users_repo, user_id, profile, baseline)

    # Handed off, not awaited. The score used to be computed inline here, which
    # cost 8.4s on prod — paid by a user whose very next screen is the direction
    # step, and that step is deliberately score-free. The work now runs while they
    # choose, so the row exists by the time step 3 needs it, and `_heal_missing_score`
    # remains the net if the job is lost.
    onboarding_service.enqueue_score_refresh(user_id, reason="skills_confirmed")

    return {
        "next": "shortlist_processing" if has_target else "target",
        "result": onboarding_service.get_result(db, user_id),
    }


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
