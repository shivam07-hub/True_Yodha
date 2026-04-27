"""
Shared Supabase reads for the job_path package — used by both plan.py and
cv_generator.py. Anything written through Supabase stays in its owning module.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.services.job_path._helpers import _single_or_none


def _get_job(db: Client, job_id: str) -> dict[str, Any]:
    row = _single_or_none(
        db.table("jobs")
        .select("job_id, job_title, company_name, apply_url, job_description")
        .eq("job_id", job_id)
        .limit(1)
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    skill_rows = (
        db.table("job_skills")
        .select("is_primary, skills(taxonomy_key)")
        .eq("job_id", job_id)
        .execute()
    ).data or []

    main_skills, side_skills = [], []
    for r in skill_rows:
        key = ((r.get("skills") or {}).get("taxonomy_key") or "").strip()
        if not key:
            continue
        (main_skills if r.get("is_primary") else side_skills).append(key)

    return {**row, "main_skills": main_skills, "side_skills": side_skills}


def _fetch_targets(db: Client, user_id: str, job_id: str) -> list[dict[str, Any]]:
    result = (
        db.table("job_application_skill_targets")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("selected_at")
        .execute()
    )
    return result.data or []


def _fetch_milestones(db: Client, user_id: str, job_id: str) -> list[dict[str, Any]]:
    result = (
        db.table("job_application_milestones")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("milestone_date")
        .execute()
    )
    return result.data or []
