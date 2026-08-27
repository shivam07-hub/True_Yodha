"""Assemble the one career-skill-path read model."""
from __future__ import annotations

from typing import Any

from supabase import Client

from app.repositories.learning_path_requests import LearningPathRequests
from app.repositories.skill_certificates import SkillCertificates
from app.services.career_skill_path_cards import (
    demand_kind,
    next_action,
    required_level,
    skill_state,
)
from app.services.career_target import current_snapshot
from app.services.job_eligibility import adjacent_source_bands
from app.services.xp_policy import UPSKILLING_SET_SIZE


def assemble(db: Client, user_id: str) -> dict[str, Any]:
    snapshot = current_snapshot(db, user_id)
    if not snapshot:
        return {
            "needs_target": True,
            "snapshot": None,
            "lower": None,
            "anchor": None,
            "higher": None,
            "next_action": next_action([], needs_target=True),
            "target_flow": _target_flow(db, user_id),
        }
    family = str(snapshot.get("l2_role_family") or "")
    anchor_band = str(snapshot.get("seniority") or "")
    lower_band, higher_band = adjacent_source_bands(anchor_band)
    requests = LearningPathRequests(db).active_by_key(user_id)
    certs = _certs_by_key(SkillCertificates(db).for_user(user_id))
    label = _family_label(db, family, snapshot.get("role_title"))
    snapshot_out = {
        "id": str(snapshot["id"]),
        "role_title": snapshot.get("role_title"),
        "career_area": snapshot.get("l1_career_area") or None,
        "role_family": family,
        "role_family_label": label,
        "seniority": anchor_band,
        "locations": list(snapshot.get("locations") or []),
        "cv_baseline_id": snapshot.get("cv_baseline_id"),
        "created_at": snapshot.get("created_at"),
    }
    maps = {
        "anchor": _band_map(db, user_id, family, anchor_band, "anchor", requests, certs),
        "lower": _band_map(db, user_id, family, lower_band, "lower", requests, certs)
        if lower_band else None,
        "higher": _band_map(db, user_id, family, higher_band, "higher", requests, certs)
        if higher_band else None,
    }
    anchor_cards = (maps["anchor"] or {}).get("cards") or []
    _fulfill_ready(db, user_id, requests, anchor_cards)
    return {
        "needs_target": False,
        "snapshot": snapshot_out,
        "lower": maps["lower"],
        "anchor": maps["anchor"],
        "higher": maps["higher"],
        "next_action": next_action(anchor_cards, needs_target=False),
        "target_flow": None,
    }


def _target_flow(db: Client, user_id: str) -> dict[str, Any] | None:
    from app.repositories.cv import CVVersionsRepository
    from app.repositories.users import UsersRepository
    from app.services import onboarding_service

    baseline = CVVersionsRepository(db).latest_baseline(user_id)
    if not baseline:
        return None
    profile = UsersRepository(db).get_profile(user_id) or {}
    return onboarding_service._awaiting_target_payload(db, user_id, profile, baseline)


def _family_label(db: Client, family: str, fallback: str | None) -> str | None:
    if not family:
        return fallback
    rows = (
        db.table("role_family_labels").select("label").eq("family", family).limit(1).execute()
    ).data or []
    if rows and rows[0].get("label"):
        return str(rows[0]["label"])
    return fallback


def _certs_by_key(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.get("taxonomy_key") or "")
        if key and key not in out:
            out[key] = row
    return out


def _band_map(
    db: Client,
    user_id: str,
    family: str,
    seniority: str | None,
    kind: str,
    requests: dict[str, dict[str, Any]],
    certs: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    if not family or not seniority:
        return None
    market = (
        db.rpc(
            "role_family_band_market_skills",
            {"p_families": [family], "p_seniority": seniority},
        ).execute().data
        or []
    )
    band_job_count = int(market[0]["band_job_count"]) if market else 0
    if band_job_count <= 0:
        return {"kind": kind, "seniority": seniority, "job_count": None, "cards": []}
    qualified: list[dict[str, Any]] = []
    for row in market:
        count = int(row.get("skill_job_count") or 0)
        kind_name = demand_kind(count, band_job_count)
        if not kind_name:
            continue
        qualified.append({**row, "_kind": kind_name, "_count": count})
    keys = [str(row["taxonomy_key"]) for row in qualified if row.get("taxonomy_key")]
    skills = _skills_by_key(db, keys)
    user_rows = _user_skills(db, user_id, [int(s["id"]) for s in skills.values() if s.get("id")])
    assessed = _assessed(db, user_id, [int(s["id"]) for s in skills.values() if s.get("id")])
    ladders = _ladder_complete(db, [int(s["id"]) for s in skills.values() if s.get("id")])
    cards: list[dict[str, Any]] = []
    for row in qualified:
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


def _skills_by_key(db: Client, keys: list[str]) -> dict[str, dict[str, Any]]:
    if not keys:
        return {}
    rows = (
        db.table("skills")
        .select("id, taxonomy_key, display_name")
        .in_("taxonomy_key", keys)
        .execute()
    ).data or []
    return {str(row["taxonomy_key"]): row for row in rows}


def _user_skills(db: Client, user_id: str, skill_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not skill_ids:
        return {}
    rows = (
        db.table("user_skills")
        .select("skill_id, matched_level, evidence_text")
        .eq("user_id", user_id)
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    return {int(row["skill_id"]): row for row in rows if row.get("skill_id") is not None}


def _assessed(db: Client, user_id: str, skill_ids: list[int]) -> dict[int, int]:
    if not skill_ids:
        return {}
    rows = (
        db.table("skill_assessed_level")
        .select("skill_id, assessed_level")
        .eq("user_id", user_id)
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    return {int(row["skill_id"]): int(row.get("assessed_level") or 0) for row in rows}


def _ladder_complete(db: Client, skill_ids: list[int]) -> dict[int, bool]:
    if not skill_ids:
        return {}
    rows = (
        db.table("skill_questions")
        .select("skill_id, level")
        .eq("status", "active")
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    counts: dict[int, dict[int, int]] = {}
    for row in rows:
        sid = int(row["skill_id"])
        lvl = int(row["level"])
        counts.setdefault(sid, {})[lvl] = counts.setdefault(sid, {}).get(lvl, 0) + 1
    return {
        sid: all(counts.get(sid, {}).get(level, 0) >= UPSKILLING_SET_SIZE for level in range(1, 6))
        for sid in skill_ids
    }


def _fulfill_ready(
    db: Client,
    user_id: str,
    requests: dict[str, dict[str, Any]],
    cards: list[dict[str, Any]],
) -> None:
    from app.repositories.notifications import NotificationsRepository

    complete = {card["taxonomy_key"] for card in cards if card.get("ladder_complete")}
    inbox = NotificationsRepository(db)
    repo = LearningPathRequests(db)
    for key, row in requests.items():
        if row.get("fulfilled_at") or key not in complete:
            continue
        name = next((c["display_name"] for c in cards if c["taxonomy_key"] == key), key)
        inbox.record_learning_path_ready(user_id, taxonomy_key=key, skill_name=name)
        repo.mark_fulfilled(str(row["id"]), None)
        row["fulfilled_at"] = "now"
        for card in cards:
            if card["taxonomy_key"] == key:
                card["request_status"] = "fulfilled"
