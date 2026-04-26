"""
Milestone planning, Readiness math, Follow-up Playbook selection, and
CV Confidence Label resolution.

Public API:
  build_rolling_milestones
  compute_readiness
  select_follow_up_playbook
  cv_confidence_for_proof_count
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta, timezone
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


# ── Milestone generation ─────────────────────────────────────────────────────

def _skill_family(skill: str) -> str:
    text = _key(skill)
    analytics_terms = ("sql", "data", "analytics", "metric", "forecast", "experiment", "statistics")
    product_terms = ("product", "roadmap", "user", "priorit", "market", "strategy")
    leadership_terms = ("leadership", "stakeholder", "management", "mentor", "ownership")
    communication_terms = ("communication", "writing", "presentation", "storytelling", "negotiation")
    if any(term in text for term in analytics_terms):
        return "analytics"
    if any(term in text for term in product_terms):
        return "product"
    if any(term in text for term in leadership_terms):
        return "leadership"
    if any(term in text for term in communication_terms):
        return "communication"
    return "technical"


def _fill_slots(text: str, *, skill: str, job_title: str, company: str) -> str:
    return (
        text.replace("{skill}", skill)
        .replace("{job_title}", job_title)
        .replace("{company}", company or "the company")
    )


def build_rolling_milestones(
    user_id: str,
    job_id: str,
    job_title: str,
    company: str | None,
    targets: list[dict[str, Any]],
    start_date: date | None = None,
    days: int = 7,
) -> list[dict[str, Any]]:
    content = _load_json("milestone_templates.json")
    start = start_date or date.today()
    normalized_targets = [
        {"skill": item["skill"], "is_primary": bool(item.get("is_primary"))}
        for item in targets
        if item.get("skill")
    ]
    if not normalized_targets:
        return []

    weighted: list[dict[str, Any]] = []
    for target in sorted(normalized_targets, key=lambda item: (not item["is_primary"], _key(item["skill"]))):
        weighted.extend([target] * (2 if target["is_primary"] else 1))

    seed = int(hashlib.sha256(f"{user_id}|{job_id}|{start.isoformat()}".encode()).hexdigest()[:8], 16)
    index = seed % len(weighted)
    last_skill: str | None = None
    template_indices: dict[str, int] = {}
    milestones: list[dict[str, Any]] = []

    for offset in range(days):
        chosen = weighted[index % len(weighted)]
        attempts = 0
        while len({item["skill"] for item in normalized_targets}) > 1 and chosen["skill"] == last_skill and attempts < len(weighted):
            index += 1
            chosen = weighted[index % len(weighted)]
            attempts += 1
        index += 1
        last_skill = chosen["skill"]

        family = _skill_family(chosen["skill"])
        templates = content["families"][family]["templates"]
        template_index = template_indices.get(family, 0)
        template = templates[template_index % len(templates)]
        template_indices[family] = template_index + 1

        slots = {
            "skill": chosen["skill"],
            "job_title": job_title,
            "company": company or "the company",
        }
        milestones.append(
            {
                "milestone_date": (start + timedelta(days=offset)).isoformat(),
                "skill": chosen["skill"],
                "is_primary": chosen["is_primary"],
                "template_id": template["id"],
                "title": _fill_slots(template["title"], **slots),
                "action": _fill_slots(template["action"], **slots),
                "proof_prompt": _fill_slots(template["proof_prompt"], **slots),
                "impact_prompt": _fill_slots(template["impact_prompt"], **slots),
                "expected_minutes": template.get("expected_minutes"),
            }
        )

    return milestones


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
        ("interview", status in {"interviewing", "interview_scheduled"}),
        ("rejection", status == "rejected"),
        ("abandoned", status in {"abandoned"} or (status == "applied" and days_since_applied >= 21 and response_dt is None)),
        ("no_response", status == "no_response" or (status == "applied" and days_since_applied >= 7 and response_dt is None)),
    ]
    for key, matched in priority:
        if matched:
            return {"id": key, **playbooks[key]}
    return None
