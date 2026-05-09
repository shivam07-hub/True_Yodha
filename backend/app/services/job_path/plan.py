"""
Application Path orchestrators — the surface called by routers/jobs.py.

Public API:
  get_application_path
  replace_skill_targets
  update_milestone
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.services.job_path._db import _fetch_milestones, _fetch_targets, _get_job
from app.services.job_path._helpers import _key, _now_iso, _single_or_none
from app.services.job_path.llm_polish import _latest_polished_cv  # noqa: F401  (kept for back-compat re-export)
from app.services.job_path.milestones import (
    compute_readiness,
    cv_confidence_for_proof_count,
    select_follow_up_playbook,
)


# ── Supabase reads owned by plan.py ─────────────────────────────────────────

def _ensure_application(db: Client, user_id: str, job_id: str) -> dict[str, Any]:
    row = _single_or_none(
        db.table("job_applications")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .limit(1)
    )
    if row:
        return row
    inserted = db.table("job_applications").insert(
        {"user_id": user_id, "job_id": job_id, "status": "pending"}
    ).execute()
    return inserted.data[0] if inserted.data else {"user_id": user_id, "job_id": job_id, "status": "pending"}


def _user_skill_levels(db: Client, user_id: str) -> dict[str, int]:
    result = (
        db.table("user_skills")
        .select("matched_level, skills(taxonomy_key)")
        .eq("user_id", user_id)
        .execute()
    )
    levels: dict[str, int] = {}
    for row in result.data or []:
        skill = row.get("skills") or {}
        key = _key(skill.get("taxonomy_key"))
        if key:
            levels[key] = int(row.get("matched_level") or 0)
    return levels


def _completed_proof_counts(milestones: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in milestones:
        if row.get("completed_at"):
            counts[_key(row.get("skill"))] = counts.get(_key(row.get("skill")), 0) + 1
    return counts


def _target_response(targets: list[dict[str, Any]], proof_counts: dict[str, int]) -> list[dict[str, Any]]:
    return [
        {
            "skill": row["skill"],
            "is_primary": bool(row.get("is_primary")),
            "selected_at": row.get("selected_at"),
            "proof_count": proof_counts.get(_key(row.get("skill")), 0),
        }
        for row in targets
    ]


def _milestone_response(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "milestone_date": row["milestone_date"],
        "skill": row["skill"],
        "is_primary": bool(row.get("is_primary")),
        "template_id": row.get("template_id"),
        "title": row["title"],
        "action": row["action"],
        "proof_prompt": row.get("proof_prompt"),
        "impact_prompt": row.get("impact_prompt"),
        "proof": row.get("proof"),
        "impact": row.get("impact"),
        "confidence": row.get("confidence"),
        "completed_at": row.get("completed_at"),
    }


def _latest_cv_variant(db: Client, user_id: str, job_id: str) -> dict[str, Any] | None:
    return _single_or_none(
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("created_at", desc=True)
        .limit(1)
    )


def _cv_summary(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    confidence = cv_confidence_for_proof_count(int(row.get("proof_count") or 0))
    return {
        "id": row.get("id"),
        "confidence": confidence,
        "snapshot_hash": row.get("snapshot_hash"),
        "ai_polished": bool(row.get("ai_polished")),
        "created_at": row.get("created_at"),
    }


# ── Orchestrators ────────────────────────────────────────────────────────────

def get_application_path(db: Client, user_id: str, job_id: str) -> dict[str, Any]:
    job = _get_job(db, job_id)
    application = _ensure_application(db, user_id, job_id)
    targets = _fetch_targets(db, user_id, job_id)
    milestones = _fetch_milestones(db, user_id, job_id)
    proof_counts = _completed_proof_counts(milestones)
    readiness = compute_readiness(
        main_skills=job.get("main_skills") or [],
        side_skills=job.get("side_skills") or [],
        user_skill_levels=_user_skill_levels(db, user_id),
        targets=targets,
        completed_proof_counts=proof_counts,
    )
    today = date.today().isoformat()
    today_milestone = next((row for row in milestones if str(row.get("milestone_date"))[:10] == today), None)
    follow_up = select_follow_up_playbook(
        status=application.get("status") or "pending",
        applied_at=application.get("applied_at"),
        response_at=application.get("response_at"),
    )
    return {
        "job_id": job_id,
        "job_title": job.get("job_title") or "",
        "company": job.get("company_name"),
        "readiness_pct": readiness["readiness_pct"],
        "readiness_tier": readiness["tier"],
        "target_skills": _target_response(targets, proof_counts),
        "milestones": [_milestone_response(row) for row in milestones],
        "today_milestone": _milestone_response(today_milestone) if today_milestone else None,
        "cv": _cv_summary(_latest_cv_variant(db, user_id, job_id)),
        "follow_up": follow_up,
        "status": application.get("status") or "pending",
        "applied_at": application.get("applied_at"),
    }


def _validate_targets(job: dict[str, Any], targets: list[Any]) -> list[dict[str, Any]]:
    valid_primary = {_key(skill): skill for skill in job.get("main_skills") or []}
    valid_secondary = {_key(skill): skill for skill in job.get("side_skills") or []}
    valid_all = {**valid_secondary, **valid_primary}
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in targets:
        skill = (getattr(item, "skill", None) or item.get("skill", "")).strip()
        skill_key = _key(skill)
        if not skill_key or skill_key in seen:
            continue
        if skill_key not in valid_all:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target skill is not part of this job: {skill}",
            )
        normalized.append(
            {
                "skill": valid_all[skill_key],
                "is_primary": skill_key in valid_primary,
            }
        )
        seen.add(skill_key)
    return normalized


def replace_skill_targets(db: Client, user_id: str, job_id: str, targets: list[Any]) -> dict[str, Any]:
    job = _get_job(db, job_id)
    _ensure_application(db, user_id, job_id)
    normalized = _validate_targets(job, targets)
    db.table("job_application_skill_targets").delete().eq("user_id", user_id).eq("job_id", job_id).execute()
    now = _now_iso()
    rows = [
        {
            "user_id": user_id,
            "job_id": job_id,
            "skill": item["skill"],
            "is_primary": item["is_primary"],
            "selected_at": now,
        }
        for item in normalized
    ]
    if rows:
        db.table("job_application_skill_targets").upsert(
            rows,
            on_conflict="user_id,job_id,skill",
        ).execute()
    return get_application_path(db, user_id, job_id)


def update_milestone(
    db: Client,
    user_id: str,
    job_id: str,
    milestone_id: str,
    body: Any,
) -> dict[str, Any]:
    updates: dict[str, Any] = {"updated_at": _now_iso()}
    if body.proof is not None:
        updates["proof"] = body.proof.strip() or None
    if body.impact is not None:
        updates["impact"] = body.impact.strip() or None
    if body.confidence is not None:
        updates["confidence"] = max(0.0, min(1.0, float(body.confidence)))
    if body.completed:
        updates["completed_at"] = _now_iso()
    result = (
        db.table("job_application_milestones")
        .update(updates)
        .eq("id", milestone_id)
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .execute()
    )
    row = result.data[0] if result.data else _single_or_none(
        db.table("job_application_milestones")
        .select("*")
        .eq("id", milestone_id)
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .limit(1)
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")
    return _milestone_response(row)
