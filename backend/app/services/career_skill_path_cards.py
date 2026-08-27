"""Skill-path card classification — demand thresholds and skill states."""
from __future__ import annotations

from typing import Any, Literal

SkillState = Literal["on_cv", "practised", "not_evidenced"]
DemandKind = Literal["core", "neighbor"]

CORE_SHARE = 0.20
NEIGHBOR_SHARE = 0.05
NEIGHBOR_MIN_ROLES = 5


def demand_kind(skill_job_count: int, band_job_count: int) -> DemandKind | None:
    """Core ≥20% of the band; neighbour ≥5% and ≥5 roles. Else omit."""
    if band_job_count <= 0 or skill_job_count <= 0:
        return None
    share = skill_job_count / band_job_count
    if share >= CORE_SHARE:
        return "core"
    if share >= NEIGHBOR_SHARE and skill_job_count >= NEIGHBOR_MIN_ROLES:
        return "neighbor"
    return None


def required_level(
    primary_job_count: int,
    band_job_count: int,
    has_side: bool,
) -> int | None:
    if band_job_count <= 0:
        return None
    if primary_job_count:
        return 4 if primary_job_count / band_job_count > 0.5 else 3
    if has_side:
        return 2
    return None


def skill_state(*, evidence_text: str | None, on_cv_row: bool, assessed_level: int) -> SkillState:
    if on_cv_row and (evidence_text or "").strip():
        return "on_cv"
    if assessed_level > 0:
        return "practised"
    return "not_evidenced"


def next_action(cards: list[dict[str, Any]], *, needs_target: bool) -> dict[str, Any] | None:
    if needs_target:
        return {"kind": "choose_target", "label": "Choose your direction"}
    for card in cards:
        if card.get("certificate_status") == "issued":
            return {
                "kind": "add_certificate_to_cv",
                "label": "Add to CV",
                "taxonomy_key": card.get("taxonomy_key"),
                "verification_id": card.get("verification_id"),
            }
    for card in cards:
        if card.get("ladder_complete") and card.get("state") != "on_cv":
            return {
                "kind": "practice",
                "label": "Practise",
                "taxonomy_key": card.get("taxonomy_key"),
                "skill_id": card.get("skill_id"),
                "level": int(card.get("next_practice_level") or 1),
            }
    for card in cards:
        if not card.get("ladder_complete") and card.get("state") != "on_cv":
            return {
                "kind": "request_learning_path",
                "label": "Request this learning path",
                "taxonomy_key": card.get("taxonomy_key"),
            }
    return None
