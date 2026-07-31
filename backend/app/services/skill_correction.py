"""Correct a wrongly-extracted skill after onboarding is over.

Onboarding asks the user to confirm what the extractor found, once, and then
the answer is frozen forever. Every CV parse produces some wrong rows — a
taxonomy near-miss ("Fitness & Strength Training" resolving to FitNesse), a
skill belonging to a different person's CV in a merged document, or a keyword
picked out of a course code. Until now the only way to fix one was to re-upload
the whole CV, which is why the ask has been open as backlog #6 / feedback #89.

Deliberately *not* built on ``confirm_cv_skills``. That RPC republishes a whole
baseline by deleting and reinserting every cv-sourced row, which resets
``forge_sessions_count`` — running it to correct a single skill would quietly
erase practice history across every other skill the user holds.

The correction is durable, not cosmetic: it writes a ``cv_skill_overrides`` row
so a later republish of the same baseline honours the ruling, exactly like the
overrides captured during onboarding. And because removing a skill changes the
evidence the score is built from, the score is recomputed in the same call —
the number a user sees must always be the number their confirmed skills produce.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.repositories.cv import CVVersionsRepository
from app.repositories.scores import ScoresRepository
from app.services import scoring

_FORGE_FIELDS = ("forge_sessions_count", "total_forge_minutes")


def _baseline_for(cv_repo: CVVersionsRepository, user_id: str) -> dict[str, Any]:
    baseline = cv_repo.latest_baseline(user_id)
    if not baseline:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload a CV before correcting your skills.",
        )
    return baseline


def _resolve_skill_id(scores_repo: ScoresRepository, taxonomy_key: str) -> int:
    skill_id = scores_repo.get_skill_id_for_key(taxonomy_key)
    if skill_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That skill is not in the Myro skill catalog.",
        )
    return skill_id


def _stash_forge(row: dict[str, Any] | None) -> dict[str, Any]:
    """Carry practice history through a removal so a restore can hand it back."""
    if not row:
        return {}
    return {field: int(row.get(field) or 0) for field in _FORGE_FIELDS}


def _candidate_from_baseline(baseline: dict[str, Any], taxonomy_key: str) -> dict[str, Any] | None:
    """The level + receipt this CV originally produced for one skill."""
    signals = [
        signal
        for signal in (baseline.get("skills_detected") or [])
        if signal.get("taxonomy_key") == taxonomy_key
    ]
    if not signals:
        return None
    level = scoring.build_skill_level_map(signals)[taxonomy_key]
    return {
        "matched_level": level,
        "proficiency_title": scoring._PROFICIENCY_TITLES.get(level, "Scout"),
        "evidence_text": scoring.best_evidence_by_key(signals).get(taxonomy_key, ""),
    }


def set_skill_included(
    db: Client,
    user_id: str,
    taxonomy_key: str,
    included: bool,
) -> dict[str, Any]:
    """Remove a skill from the user's scored set, or put it back.

    Returns the recomputed score so the caller can reflect the new number
    immediately rather than telling the user to refresh.
    """
    scores_repo = ScoresRepository(db)
    cv_repo = CVVersionsRepository(db)
    baseline = _baseline_for(cv_repo, user_id)
    baseline_id = int(baseline["id"])
    skill_id = _resolve_skill_id(scores_repo, taxonomy_key)
    existing = scores_repo.get_user_skill_row(user_id, skill_id)

    if not included:
        if existing:
            cv_repo.upsert_skill_override(
                user_id,
                baseline_id,
                skill_id,
                action="exclude",
                evidence_text=str(existing.get("evidence_text") or ""),
                source_location={"forge": _stash_forge(existing)},
            )
            scores_repo.delete_user_skill(user_id, skill_id)
        # Already absent → the override is still the durable part of the ruling.
        elif not cv_repo.get_skill_override(user_id, baseline_id, skill_id):
            cv_repo.upsert_skill_override(
                user_id, baseline_id, skill_id, action="exclude", evidence_text="",
            )
    else:
        override = cv_repo.get_skill_override(user_id, baseline_id, skill_id)
        if not existing:
            candidate = _candidate_from_baseline(baseline, taxonomy_key)
            if candidate is None:
                # The CV never evidenced it, so restoring would be inventing a
                # skill rather than undoing a removal. Refuse loudly (ADR-0016).
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Your CV has no evidence for that skill — re-upload to add it.",
                )
            stashed = ((override or {}).get("source_location") or {}).get("forge") or {}
            scores_repo.upsert_user_skill_rows([
                {
                    "user_id": user_id,
                    "skill_id": skill_id,
                    "source": "cv",
                    **candidate,
                    **{field: int(stashed.get(field) or 0) for field in _FORGE_FIELDS},
                }
            ])
        if override:
            cv_repo.delete_skill_override(user_id, baseline_id, skill_id)

    return scoring.recompute_score(scores_repo, user_id)
