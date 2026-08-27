"""Canonical career-target snapshot: six-band seniority, one current row.

`user_profiles` stays the compatibility projection. This module is the only
place a direction change becomes a `career_target_snapshots` row.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.services.job_eligibility import (
    SOURCE_SENIORITY,
    adjacent_source_bands,
    canonical_source_seniority,
)

MAX_TARGET_LOCATIONS = 3


def is_canonical_direction(profile: dict[str, Any]) -> bool:
    """True when the profile can mint a CareerTargetSnapshot."""
    title = _primary_title(profile)
    family = _primary_family(profile)
    seniority = canonical_source_seniority(profile.get("target_seniority"))
    return bool(title and family and seniority in SOURCE_SENIORITY)


def _primary_title(profile: dict[str, Any]) -> str:
    titles = profile.get("target_role_titles") or []
    if isinstance(titles, str):
        titles = [titles]
    for value in [*titles, profile.get("target_role_title")]:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _primary_family(profile: dict[str, Any]) -> str:
    for value in profile.get("target_roles") or []:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _locations(profile: dict[str, Any]) -> list[str]:
    raw = profile.get("target_locations")
    if not isinstance(raw, list):
        single = str(profile.get("target_location") or "").strip()
        return [single] if single else []
    seen: list[str] = []
    for value in raw:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.append(text)
        if len(seen) >= MAX_TARGET_LOCATIONS:
            break
    return seen


def _same_snapshot(before: dict[str, Any], after: dict[str, Any]) -> bool:
    return (
        _primary_title(before) == _primary_title(after)
        and _primary_family(before) == _primary_family(after)
        and canonical_source_seniority(before.get("target_seniority"))
        == canonical_source_seniority(after.get("target_seniority"))
        and _locations(before) == _locations(after)
    )


def _l1_for_family(db: Client, family: str) -> str | None:
    if not family or not hasattr(db, "rpc"):
        return None
    rows = db.rpc("l1_career_area_for_family", {"p_family": family}).execute().data
    if isinstance(rows, str) and rows.strip():
        return rows.strip()
    if isinstance(rows, list) and rows:
        first = rows[0]
        if isinstance(first, str) and first.strip():
            return first.strip()
        if isinstance(first, dict):
            text = str(first.get("l1_career_area_for_family") or first.get("l1_domain") or "").strip()
            return text or None
    return None


def _latest_baseline_id(db: Client, user_id: str) -> int | None:
    if not hasattr(db, "table"):
        return None
    rows = (
        db.table("cv_versions")
        .select("id")
        .eq("user_id", user_id)
        .eq("kind", "baseline_upload")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        return None
    try:
        return int(rows[0]["id"])
    except (KeyError, TypeError, ValueError):
        return None


def current_snapshot(db: Client, user_id: str) -> dict[str, Any] | None:
    if not hasattr(db, "table"):
        return None
    rows = (
        db.table("career_target_snapshots")
        .select("*")
        .eq("user_id", user_id)
        .is_("superseded_at", "null")
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def record_from_profile(
    db: Client,
    user_id: str,
    before: dict[str, Any],
    after: dict[str, Any],
) -> dict[str, Any] | None:
    """Supersede the current snapshot and insert a new one when direction is canonical.

    A cleared or incomplete direction supersedes without inserting, so the user
    is gated until they finish the standardized flow.
    """
    if not hasattr(db, "table"):
        return None
    if not is_canonical_direction(after):
        db.table("career_target_snapshots").update(
            {"superseded_at": datetime.now(timezone.utc).isoformat()}
        ).eq("user_id", user_id).is_("superseded_at", "null").execute()
        return None
    existing = current_snapshot(db, user_id)
    if existing and _same_snapshot(before, after):
        return existing
    now = datetime.now(timezone.utc).isoformat()
    db.table("career_target_snapshots").update({"superseded_at": now}).eq(
        "user_id", user_id
    ).is_("superseded_at", "null").execute()
    family = _primary_family(after)
    row = {
        "user_id": user_id,
        "role_title": _primary_title(after),
        "l1_career_area": _l1_for_family(db, family),
        "l2_role_family": family,
        "seniority": canonical_source_seniority(after.get("target_seniority")),
        "locations": _locations(after),
        "cv_baseline_id": _latest_baseline_id(db, user_id),
        "created_at": now,
    }
    created = db.table("career_target_snapshots").insert(row).execute().data or []
    return created[0] if created else row


__all__ = [
    "MAX_TARGET_LOCATIONS",
    "SOURCE_SENIORITY",
    "adjacent_source_bands",
    "canonical_source_seniority",
    "current_snapshot",
    "is_canonical_direction",
    "record_from_profile",
]
