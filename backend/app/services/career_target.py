"""Canonical career-target snapshot: six-band seniority, one current row.

`user_profiles` stays the compatibility projection. This module is the only
place a direction change becomes a `career_target_snapshots` row, and it
writes that row through one database function, `record_career_target`.
"""
from __future__ import annotations

from typing import Any

from supabase import Client

from app.database import get_supabase_admin
from app.repositories.users import UsersRepository
from app.services import background
from app.services.job_eligibility import (
    SOURCE_SENIORITY,
    adjacent_source_bands,
    canonical_source_seniority,
)

MAX_TARGET_LOCATIONS = 5


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


def record_from_profile(user_id: str, profile: dict[str, Any]) -> None:
    """Make the current snapshot say what this profile says. One round trip.

    The write runs as the service role: owners may read their snapshots and no
    user token may write them. The caller passes no client, so it cannot pass
    the wrong one — from a user token the old five-step write 500'd after the
    profile had already changed.

    `record_career_target` does the rest in one transaction: a cleared or
    incomplete direction supersedes without inserting, the same direction as
    the current row is a no-op, and a missing or drifted current row is
    replaced — so any direction write brings the snapshot forward.
    """
    canonical = is_canonical_direction(profile)
    get_supabase_admin().rpc("record_career_target", {
        "p_user_id": user_id,
        "p_role_title": _primary_title(profile) if canonical else None,
        "p_family": _primary_family(profile) if canonical else None,
        "p_seniority": (
            canonical_source_seniority(profile.get("target_seniority")) if canonical else None
        ),
        "p_locations": _locations(profile),
    }).execute()


@background.handler("career_target_sync")
async def _career_target_sync(payload: dict[str, Any], allow_retry: bool) -> None:
    """Bring a returning user's snapshot up to the direction their profile holds.

    Enqueued by `forward_pass.on_career_path_read`. Writes only a canonical
    direction: a pass never supersedes, because `restore_scope_from_snapshot`
    reads the family a stale snapshot still holds for people whose profile lost
    it. `record_career_target` is a no-op when the snapshot already agrees.
    """
    user_id = str(payload["user_id"])
    profile = UsersRepository(get_supabase_admin()).get_profile(user_id) or {}
    if not is_canonical_direction(profile):
        return
    record_from_profile(user_id, profile)


__all__ = [
    "MAX_TARGET_LOCATIONS",
    "SOURCE_SENIORITY",
    "adjacent_source_bands",
    "canonical_source_seniority",
    "current_snapshot",
    "is_canonical_direction",
    "record_from_profile",
]
