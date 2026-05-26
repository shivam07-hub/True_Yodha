"""
profile/public.py
Public profile endpoints for /profile/{ninja_name}.

Surfaces:
  GET  /profile/{ninja_name}          — no auth, reads public_profile_v.
  GET  /profile/{ninja_name}/overlap  — auth, intersect viewer/owner active apps.
  POST /profile/ninja-name            — auth, update own slug.
  GET  /profile/ninja-name/suggest    — auth, return an available candidate.

PII discipline:
  Public endpoint MUST NEVER return email, full_name, linkedin_url, raw skills,
  or anything not in PublicProfile schema. Tests assert this.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.schemas import (
    JobOverlapResponse,
    JobOverlapRow,
    PublicProfile,
    SuggestNinjaNameResponse,
    UpdateNinjaNameRequest,
    UpdateNinjaNameResponse,
)
from app.services import ninja_name as nn

router = APIRouter()
logger = logging.getLogger(__name__)

_ACTIVE_STATUSES = ("saved", "applied", "screening", "interviewing", "final_round")
_OVERLAP_LIMIT = 3


def _admin() -> Client:
    return get_supabase_admin()


def _fetch_public_profile(ninja_name: str, admin: Client) -> Optional[dict]:
    result = (
        admin.table("public_profile_v")
        .select("*")
        .eq("ninja_name", ninja_name)
        .maybe_single()
        .execute()
    )
    return (result.data if result else None) or None


def _resolve_owner_id(ninja_name: str, admin: Client) -> Optional[str]:
    return nn.resolve_user_id_by_name(ninja_name, admin=admin)


# ── Public read ────────────────────────────────────────────────────────────

@router.get("/{ninja_name}", response_model=PublicProfile)
async def get_public_profile(ninja_name: str) -> PublicProfile:
    name = ninja_name.strip().lower()
    if not nn.is_valid(name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    row = _fetch_public_profile(name, _admin())
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    # Defensive: drop any PII keys if the view ever leaks them.
    return PublicProfile(
        ninja_name=row["ninja_name"],
        mirror_score=row.get("mirror_score"),
        domain_scores=row.get("domain_scores"),
        tier_label=row.get("tier_label"),
        forge_sessions_count=int(row.get("forge_sessions_count") or 0),
        diary_count=int(row.get("diary_count") or 0),
        tracker_count=int(row.get("tracker_count") or 0),
    )


# ── Job overlap ────────────────────────────────────────────────────────────

def _fetch_active_app_job_ids(admin: Client, user_id: str) -> dict[str, str]:
    """Returns { job_id: status } for a user's active applications."""
    result = (
        admin.table("job_applications")
        .select("job_id, status")
        .eq("user_id", user_id)
        .in_("status", list(_ACTIVE_STATUSES))
        .execute()
    )
    return {r["job_id"]: r.get("status") or "" for r in (result.data or [])}


def _fetch_job_summaries(admin: Client, job_ids: list[str]) -> dict[str, dict]:
    if not job_ids:
        return {}
    result = (
        admin.table("jobs")
        .select("job_id, job_title, company_name")
        .in_("job_id", job_ids)
        .execute()
    )
    return {r["job_id"]: r for r in (result.data or [])}


def _last_monday_iso() -> str:
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


def _fetch_match_scores(admin: Client, user_id: str, job_ids: list[str]) -> dict[str, float]:
    if not job_ids:
        return {}
    this_week = (
        admin.table("user_job_matches")
        .select("job_id, overlap_score")
        .eq("user_id", user_id)
        .in_("job_id", job_ids)
        .eq("batch_week", _last_monday_iso())
        .execute()
    )

    rows = this_week.data or []
    if not rows:
        # Fallback for users whose most recent match set predates current week.
        history = (
            admin.table("user_job_matches")
            .select("job_id, overlap_score, batch_week, computed_at")
            .eq("user_id", user_id)
            .in_("job_id", job_ids)
            .order("batch_week", desc=True)
            .order("computed_at", desc=True)
            .execute()
        )
        rows = history.data or []

    latest_scores: dict[str, float] = {}
    for row in rows:
        job_id = str(row.get("job_id") or "")
        if not job_id or job_id in latest_scores:
            continue
        latest_scores[job_id] = float(row.get("overlap_score") or 0)
    return latest_scores


@router.get("/{ninja_name}/overlap", response_model=JobOverlapResponse)
async def get_job_overlap(
    ninja_name: str,
    principal: Principal = Depends(get_principal),
) -> JobOverlapResponse:
    name = ninja_name.strip().lower()
    if not nn.is_valid(name):
        return JobOverlapResponse(rows=[])

    admin = _admin()
    owner_id = _resolve_owner_id(name, admin=admin)
    viewer_id = principal.id

    if not owner_id or owner_id == viewer_id:
        return JobOverlapResponse(rows=[])

    owner_apps = _fetch_active_app_job_ids(admin, owner_id)
    viewer_apps = _fetch_active_app_job_ids(admin, viewer_id)
    shared = [jid for jid in viewer_apps if jid in owner_apps]
    if not shared:
        return JobOverlapResponse(rows=[])

    jobs = _fetch_job_summaries(admin, shared)
    viewer_scores = _fetch_match_scores(admin, viewer_id, shared)
    owner_scores = _fetch_match_scores(admin, owner_id, shared)

    rows: list[JobOverlapRow] = []
    for job_id in shared:
        job = jobs.get(job_id, {})
        rows.append(
            JobOverlapRow(
                job_id=job_id,
                role=job.get("job_title"),
                company_name=job.get("company_name"),
                viewer_match_pct=viewer_scores.get(job_id),
                owner_match_pct=owner_scores.get(job_id),
                viewer_status=viewer_apps.get(job_id),
                owner_status=owner_apps.get(job_id),
            )
        )

    rows.sort(key=lambda r: r.viewer_match_pct or 0.0, reverse=True)
    return JobOverlapResponse(rows=rows[:_OVERLAP_LIMIT])


# ── Self-management ────────────────────────────────────────────────────────

@router.post("/ninja-name", response_model=UpdateNinjaNameResponse)
async def update_ninja_name(
    body: UpdateNinjaNameRequest,
    principal: Principal = Depends(get_principal),
) -> UpdateNinjaNameResponse:
    name = body.ninja_name
    if not nn.is_valid(name):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid name. Use 3–32 lowercase letters, digits, or hyphens.",
        )
    admin = _admin()
    # Allow keeping current name (idempotent).
    current = (
        admin.table("user_profiles")
        .select("ninja_name")
        .eq("id", principal.id)
        .maybe_single()
        .execute()
    )
    current_name = (current.data or {}).get("ninja_name") if current else None
    if current_name != name and not nn.is_available(name, admin=admin):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That name is taken.")
    nn.claim(principal.id, name, admin=admin)
    return UpdateNinjaNameResponse(ninja_name=name)


@router.get("/ninja-name/suggest", response_model=SuggestNinjaNameResponse)
async def suggest_ninja_name(
    principal: Principal = Depends(get_principal),
) -> SuggestNinjaNameResponse:
    """Onboarding seed.

    Order of preference:
      1. Existing persisted ninja_name on the user's profile (auto-provisioned at signup).
         Returning the same value here prevents the "I already gave a name, why is it
         different?" complaint reported during mobile QA.
      2. Slug derived from the user's full_name (e.g. "shivam-pathak-9k2v").
      3. Random adjective-noun fallback.
    """
    admin = _admin()
    user_id = principal.id

    profile = (
        admin.table("user_profiles")
        .select("ninja_name, full_name")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    row = (profile.data if profile else {}) or {}
    existing = row.get("ninja_name")
    if existing and nn.is_valid(existing):
        return SuggestNinjaNameResponse(ninja_name=existing)

    return SuggestNinjaNameResponse(
        ninja_name=nn.generate_from_full_name(row.get("full_name"), admin=admin)
    )
