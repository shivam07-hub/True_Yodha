"""
Per-Job CV Variant generation. Orchestrates the deterministic CV builder, the
optional AI Polish step (multi-provider fallback), the Quality Gate, and the
content-addressable Snapshot Hash cache.

Public API:
  generate_job_cv

Internal but patched by tests:
  _snapshot_hash, _call_ai_polish

LLM Provider Chain — slated to migrate to a unified provider abstraction in
Phase 3 of the modularity refactor.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.services.job_path._db import _fetch_milestones, _fetch_targets, _get_job
from app.services.job_path._helpers import _now_iso, _single_or_none
from app.services.job_path.llm_polish import (
    AI_POLISH_LIMIT,
    _ai_polish_count,
    _call_ai_polish,
    _latest_polished_cv,
)
from app.services.job_path.milestones import cv_confidence_for_proof_count
from app.services.job_path.quality_gate import (
    QualityGateResult,
    polish_output_passes_quality_gates,
)

logger = logging.getLogger(__name__)


def _latest_cv_history(db: Client, user_id: str) -> dict[str, Any] | None:
    return _single_or_none(
        db.table("cv_history")
        .select("*")
        .eq("user_id", user_id)
        .order("version_number", desc=True)
        .limit(1)
    )


def _profile_cv_text(db: Client, user_id: str) -> str | None:
    row = _single_or_none(
        db.table("user_profiles")
        .select("cv_raw_text")
        .eq("id", user_id)
        .limit(1)
    )
    return (row or {}).get("cv_raw_text")


def _completed_milestones(milestones: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [row for row in milestones if row.get("completed_at")]
    return sorted(rows, key=lambda row: str(row.get("completed_at") or ""))


def _snapshot_hash(
    user_id: str,
    job_id: str,
    cv_version: int,
    completed: list[dict[str, Any]],
) -> str:
    proof_payload = [
        {
            "id": str(row.get("id")),
            "skill": row.get("skill"),
            "proof": row.get("proof"),
            "impact": row.get("impact"),
            "completed_at": row.get("completed_at"),
        }
        for row in completed
    ]
    raw = json.dumps(
        {
            "user_id": user_id,
            "job_id": job_id,
            "cv_version": cv_version,
            "proofs": proof_payload,
        },
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_deterministic_cv(
    baseline_text: str,
    job: dict[str, Any],
    targets: list[dict[str, Any]],
    completed: list[dict[str, Any]],
    confidence: dict[str, Any],
) -> str:
    lines = [
        f"{confidence['label']} for {job.get('job_title') or 'Tracked role'}",
        "",
        "Job fit focus",
        f"Company: {job.get('company_name') or 'Unknown'}",
        f"Role: {job.get('job_title') or 'Tracked role'}",
        "",
        "Target skills",
    ]
    if targets:
        for target in targets:
            marker = "primary" if target.get("is_primary") else "secondary"
            lines.append(f"- {target['skill']} ({marker})")
    else:
        lines.append("- No target skills selected yet.")

    lines.extend(["", "Completed proof for this job"])
    if completed:
        for row in completed:
            parts = [f"- {row.get('skill')}: {row.get('proof') or 'Proof logged'}"]
            if row.get("impact"):
                parts.append(f"Impact: {row['impact']}.")
            lines.append(" ".join(parts))
    else:
        lines.append("- No job-scoped proof logged yet. This is a starter CV.")

    lines.extend(["", "Baseline CV", baseline_text.strip()])
    return "\n".join(lines).strip() + "\n"


def _ensure_application_minimal(db: Client, user_id: str, job_id: str) -> None:
    """Lazy create — keeps generate_job_cv independent of plan.py orchestrators."""
    existing = _single_or_none(
        db.table("job_applications")
        .select("id")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .limit(1)
    )
    if existing:
        return
    db.table("job_applications").insert(
        {"user_id": user_id, "job_id": job_id, "status": "pending"}
    ).execute()


def generate_job_cv(
    db: Client,
    user_id: str,
    job_id: str,
    ai_polish: bool = False,
) -> dict[str, Any]:
    job = _get_job(db, job_id)
    _ensure_application_minimal(db, user_id, job_id)
    latest_cv = _latest_cv_history(db, user_id)
    baseline_text = (latest_cv or {}).get("cv_raw_text") or _profile_cv_text(db, user_id)
    if not baseline_text:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload a baseline CV first.")

    cv_version = int((latest_cv or {}).get("version_number") or 1)
    targets = _fetch_targets(db, user_id, job_id)
    completed = _completed_milestones(_fetch_milestones(db, user_id, job_id))
    proof_count = len(completed)
    confidence = cv_confidence_for_proof_count(proof_count)
    snapshot_hash = _snapshot_hash(user_id, job_id, cv_version, completed)

    cached = _single_or_none(
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .eq("snapshot_hash", snapshot_hash)
        .limit(1)
    )
    polish_used = _ai_polish_count(db, user_id)
    if cached and (not ai_polish or cached.get("polished_text")):
        return {
            "id": cached["id"],
            "job_id": job_id,
            "cv_text": cached.get("deterministic_text"),
            "polished_text": cached.get("polished_text"),
            "confidence": confidence,
            "snapshot_hash": snapshot_hash,
            "from_cache": True,
            "ai_polish_used": polish_used,
            "ai_polish_limit": AI_POLISH_LIMIT,
            "limit_reached": False,
            "polish_unavailable": False,
        }

    deterministic_text = _build_deterministic_cv(baseline_text, job, targets, completed, confidence)
    limit_reached = bool(ai_polish and polish_used >= AI_POLISH_LIMIT)

    payload = {
        "user_id": user_id,
        "job_id": job_id,
        "cv_version_number": cv_version,
        "confidence_label": confidence["id"],
        "deterministic_text": deterministic_text,
        "polished_text": None,
        "snapshot_hash": snapshot_hash,
        "proof_count": proof_count,
        "ai_polished": False,
        "ai_polish_used_at": None,
    }

    if not cached:
        insert_result = db.table("job_cv_variants").insert(payload).execute()
        cached = insert_result.data[0] if insert_result.data else {**payload, "id": 0}
    row = cached

    if limit_reached:
        fallback = _latest_polished_cv(db, user_id, job_id)
        if fallback and fallback.get("polished_text"):
            return {
                "id": fallback.get("id", row.get("id", 0)),
                "job_id": job_id,
                "cv_text": fallback.get("deterministic_text") or deterministic_text,
                "polished_text": fallback.get("polished_text"),
                "confidence": confidence,
                "snapshot_hash": snapshot_hash,
                "from_cache": True,
                "ai_polish_used": polish_used,
                "ai_polish_limit": AI_POLISH_LIMIT,
                "limit_reached": True,
                "polish_unavailable": False,
            }

    if ai_polish and not limit_reached:
        polished_text = _call_ai_polish(baseline_text, job, targets, completed)
        gate = QualityGateResult(False, "empty_response")
        if polished_text:
            gate = polish_output_passes_quality_gates(
                polished_text,
                baseline_text,
                {
                    "baseline_text": baseline_text,
                    "job_description": job.get("job_description") or "",
                    "target_skills": [row.get("skill") for row in targets],
                    "proof_texts": [
                        " ".join(
                            [
                                str(item.get("skill") or ""),
                                str(item.get("proof") or ""),
                                str(item.get("impact") or ""),
                            ]
                        )
                        for item in completed
                    ],
                },
            )
        if polished_text and gate.accepted:
            update_payload = {
                "polished_text": polished_text,
                "ai_polished": True,
                "ai_polish_used_at": _now_iso(),
                "updated_at": _now_iso(),
            }
            update_result = (
                db.table("job_cv_variants")
                .update(update_payload)
                .eq("id", row.get("id"))
                .eq("user_id", user_id)
                .execute()
            )
            row = update_result.data[0] if update_result.data else {**row, **update_payload}
            return {
                "id": row.get("id", 0),
                "job_id": job_id,
                "cv_text": row.get("deterministic_text") or deterministic_text,
                "polished_text": row.get("polished_text"),
                "confidence": confidence,
                "snapshot_hash": snapshot_hash,
                "from_cache": False,
                "ai_polish_used": polish_used + 1,
                "ai_polish_limit": AI_POLISH_LIMIT,
                "limit_reached": False,
                "polish_unavailable": False,
            }
        if gate.reason:
            logger.info("CV polish rejected for user=%s job=%s reason=%s", user_id, job_id, gate.reason)

    return {
        "id": row.get("id", 0),
        "job_id": job_id,
        "cv_text": row.get("deterministic_text") or deterministic_text,
        "polished_text": row.get("polished_text"),
        "confidence": confidence,
        "snapshot_hash": snapshot_hash,
        "from_cache": False,
        "ai_polish_used": polish_used,
        "ai_polish_limit": AI_POLISH_LIMIT,
        "limit_reached": limit_reached,
        "polish_unavailable": bool(ai_polish and not limit_reached),
    }
