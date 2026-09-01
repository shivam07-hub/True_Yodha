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


def build_band(
    *,
    kind: str,
    seniority: str,
    market: list[dict[str, Any]],
    skills: dict[str, dict[str, Any]],
    user_rows: dict[int, dict[str, Any]],
    assessed: dict[int, int],
    ladders: dict[int, bool],
    requests: dict[str, dict[str, Any]],
    certs: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Turn one band's market rows plus the shared user state into cards.

    Pure: every read this needs has already happened. That is the point — the
    read shape of /career-skill-path lives in one place (career_skill_path_read)
    and the card rules live here, so neither can grow a hidden round trip.
    """
    band_job_count = int(market[0]["band_job_count"]) if market else 0
    if band_job_count <= 0:
        return {"kind": kind, "seniority": seniority, "job_count": None, "cards": []}

    cards: list[dict[str, Any]] = []
    for row in qualified_demand(market, band_job_count):
        key = str(row["taxonomy_key"])
        skill = skills.get(key) or {}
        sid = int(skill["id"]) if skill.get("id") else None
        cv_row = user_rows.get(sid) if sid else None
        assessed_level = assessed.get(sid, 0) if sid else 0
        state = skill_state(
            evidence_text=(cv_row or {}).get("evidence_text"),
            on_cv_row=cv_row is not None,
            assessed_level=assessed_level,
        )
        cv_level = int((cv_row or {}).get("matched_level") or 0) if cv_row else None
        current = cv_level if state == "on_cv" else (assessed_level or None)
        req = required_level(
            int(row.get("primary_job_count") or 0),
            band_job_count,
            bool(row.get("has_side_skill")),
        )
        cert = certs.get(key)
        cert_status = "none"
        verification_id = None
        if cert:
            cert_status = "on_cv" if cert.get("cv_promoted_at") else "issued"
            verification_id = cert.get("verification_id")
        complete = bool(sid and ladders.get(sid))
        request = requests.get(key)
        request_status = "none"
        if request:
            request_status = "fulfilled" if request.get("fulfilled_at") else "recorded"
        next_level = min((assessed_level or 0) + 1, 5) if complete else None
        cards.append({
            "skill_id": sid,
            "taxonomy_key": key,
            "display_name": skill.get("display_name") or key,
            "state": state,
            "current_level": current,
            "required_level": req,
            "evidence_pointer": ((cv_row or {}).get("evidence_text") or "")[:180] or None
            if state == "on_cv" else None,
            "demand": {
                "kind": row["_kind"],
                "skill_job_count": row["_count"],
                "band_job_count": band_job_count,
            },
            "ladder_complete": complete,
            "certificate_status": cert_status,
            "verification_id": verification_id,
            "next_practice_level": next_level,
            "request_status": request_status,
        })
    cards.sort(key=lambda c: (0 if c["demand"]["kind"] == "core" else 1, -(c["demand"]["skill_job_count"])))
    return {
        "kind": kind,
        "seniority": seniority,
        "job_count": band_job_count,
        "cards": cards,
    }


def qualified_demand(market: list[dict[str, Any]], band_job_count: int) -> list[dict[str, Any]]:
    """Market rows that clear the demand threshold, stamped with their kind."""
    qualified: list[dict[str, Any]] = []
    for row in market:
        count = int(row.get("skill_job_count") or 0)
        kind_name = demand_kind(count, band_job_count)
        if not kind_name:
            continue
        qualified.append({**row, "_kind": kind_name, "_count": count})
    return qualified
