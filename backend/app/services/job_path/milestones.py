"""
Readiness math, Follow-up Playbook selection, and CV Confidence Label resolution.

Public API:
  compute_readiness
  select_follow_up_playbook
  cv_confidence_for_proof_count
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.job_path._content import _load_json
from app.services.job_path._helpers import _key, _parse_datetime


# ── Readiness ────────────────────────────────────────────────────────────────

def _readiness_content() -> dict[str, Any]:
    return _load_json("readiness_tiers.json")


def _tier_for_pct(pct: int) -> dict[str, Any]:
    tiers = _readiness_content()["tiers"]
    for tier in tiers:
        lo, hi = tier["range"]
        if lo <= pct <= hi:
            return tier
    return tiers[-1]


def compute_readiness(
    main_skills: list[str],
    side_skills: list[str],
    user_skill_levels: dict[str, int],
    targets: list[dict[str, Any]],
    completed_proof_counts: dict[str, int],
) -> dict[str, Any]:
    math = _readiness_content()["math"]
    target_keys = {_key(item.get("skill")) for item in targets}
    proof_keys = {skill_key for skill_key, count in completed_proof_counts.items() if count > 0}

    weighted_total = 0.0
    weighted_credit = 0.0
    ordered_skills: list[tuple[str, bool]] = []
    seen: set[str] = set()
    for skill in main_skills:
        if _key(skill) and _key(skill) not in seen:
            ordered_skills.append((skill, True))
            seen.add(_key(skill))
    for skill in side_skills:
        if _key(skill) and _key(skill) not in seen:
            ordered_skills.append((skill, False))
            seen.add(_key(skill))

    for skill, is_primary in ordered_skills:
        skill_key = _key(skill)
        weight = math["primary_weight"] if is_primary else math["secondary_weight"]
        weighted_total += float(weight)
        if skill_key in user_skill_levels and user_skill_levels[skill_key] > 0:
            credit = math["existing_skill_credit"]
        elif skill_key in proof_keys:
            credit = math["target_with_proof_credit"]
        elif skill_key in target_keys:
            credit = math["target_no_proof_credit"]
        else:
            credit = 0.0
        weighted_credit += float(credit) * float(weight)

    pct = round((weighted_credit / weighted_total) * 100) if weighted_total else 0
    pct = max(0, min(100, pct))
    return {
        "readiness_pct": pct,
        "tier": _tier_for_pct(pct),
    }


# ── Follow-up Playbook + CV Confidence Label ─────────────────────────────────

def cv_confidence_for_proof_count(proof_count: int) -> dict[str, Any]:
    labels = _load_json("cv_confidence_labels.json")["labels"]
    if proof_count <= 0:
        target_id = "starter"
    elif proof_count < 3:
        target_id = "proof_backed"
    else:
        target_id = "strong_evidence"
    return next(label for label in labels if label["id"] == target_id)


def select_follow_up_playbook(
    status: str,
    applied_at: str | datetime | None,
    response_at: str | datetime | None,
) -> dict[str, Any] | None:
    applied_dt = _parse_datetime(applied_at)
    response_dt = _parse_datetime(response_at)
    days_since_applied = 0
    if applied_dt:
        days_since_applied = (datetime.now(timezone.utc) - applied_dt).days

    playbooks = _load_json("follow_up_playbooks.json")["playbooks"]
    priority = [
        ("offer", status == "offer"),
        ("interview", status in {"interviewing", "final_round", "screening"}),
        ("rejection", status == "rejected"),
        ("abandoned", status == "withdrew" or (status == "applied" and days_since_applied >= 21 and response_dt is None)),
        ("no_response", status == "ghosted" or (status == "applied" and days_since_applied >= 7 and response_dt is None)),
    ]
    for key, matched in priority:
        if matched:
            return {"id": key, **playbooks[key]}
    return None
