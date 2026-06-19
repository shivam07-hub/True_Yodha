"""Preview-only analysis for users who do not yet have a CV."""
from __future__ import annotations

import hashlib
from typing import Any

from app.database import get_supabase_admin
from app.repositories import cv_upload_jobs
from app.repositories.onboarding import OnboardingRepository
from app.services import background, cv_parser
from app.services.llm_provider import get_cv_upload_provider


def build_preview_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    skills = []
    for item in (parsed.get("skills_detected") or [])[:5]:
        name = str(item.get("display_name") or item.get("taxonomy_key") or "").strip()
        if not name:
            continue
        skills.append(
            {
                "name": name,
                "taxonomy_key": item.get("taxonomy_key") or name,
                "evidence": str(item.get("evidence") or "").strip(),
            }
        )
    center = min(72, 12 + len(skills) * 9)
    return {
        "skills": skills,
        "estimate_min": max(0, center - 8),
        "estimate_max": min(100, center + 8),
    }


def start_profile_preview(
    user_id: str,
    description: str,
    *,
    idempotency_key: str | None = None,
) -> str:
    raw_text = description.strip()
    content_hash = hashlib.sha256(raw_text.encode()).hexdigest()
    if idempotency_key:
        existing = cv_upload_jobs.find_by_idempotency_key(user_id, idempotency_key)
        if existing:
            return str(existing["id"])
    job_id = cv_upload_jobs.create_processing_job(
        user_id=user_id,
        content_hash=content_hash,
        idempotency_key=idempotency_key,
        analysis_kind="profile_preview",
    )
    OnboardingRepository(get_supabase_admin()).patch_state(
        user_id,
        {
            "status": "analyzing",
            "current_stage": "target",
            "entry_mode": "description",
            "description_text": raw_text,
            "upload_job_id": job_id,
        },
    )
    background.enqueue(
        background.LANE_FAST,
        "onboarding_profile_preview",
        payload={"job_id": job_id, "user_id": user_id, "raw_text": raw_text},
        correlation_id=job_id,
    )
    return job_id


@background.handler("onboarding_profile_preview")
async def run_profile_preview(payload: dict[str, Any], allow_retry: bool) -> None:
    job_id = str(payload["job_id"])
    user_id = str(payload["user_id"])
    cv_upload_jobs.set_phase(job_id, "reading")
    try:
        parsed = await cv_parser.parse_cv_text(
            str(payload["raw_text"]),
            provider=get_cv_upload_provider(),
        )
    except Exception:
        if allow_retry:
            raise
        cv_upload_jobs.mark_failed(
            job_id,
            error_code="preview_unavailable",
            error_detail="Myro could not read that description yet.",
            refunded=False,
        )
        return
    if parsed.get("provider_failed") or not parsed.get("skills_detected"):
        cv_upload_jobs.mark_failed(
            job_id,
            error_code="no_preview_skills",
            error_detail="Add a little more detail about your work and tools.",
            refunded=False,
        )
        return
    cv_upload_jobs.set_phase(job_id, "finding_skills")
    result = build_preview_payload(parsed)
    midpoint = (result["estimate_min"] + result["estimate_max"]) / 2
    cv_upload_jobs.mark_done(
        job_id,
        skills_detected=len(result["skills"]),
        score=midpoint,
        result_payload=result,
    )
    OnboardingRepository(get_supabase_admin()).patch_state(
        user_id,
        {
            "status": "result_ready",
            "current_stage": "result",
            "preview_payload": result,
        },
    )
