"""career_profile — token-scoped store for the caller's recruiter fact-layer.

ONE row per user (`career_profile.data` jsonb = the CareerProfile shape). Own-only:
RLS enforces `auth.uid() = user_id` and every query also filters user_id.

Write-through (grill lock L8): every save mirrors a prose summary of the facts
into `user_memory` (tagged `resolved->>'origin' = 'career_profile'`) so the persona
canvas and semantic recall stay fed from one source of truth. The structured store
is authoritative; the prose rows are a derived mirror — rebuilt on each save.
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db

# Prose mirror: field → (user_memory kind, sentence builder). Only fields worth
# surfacing in persona/recall are mirrored — pure-numeric splits stay structured.
_MIRROR_ORIGIN = "career_profile"


def _prose_rows(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Build the user_memory prose rows for the non-null facts worth recalling."""
    rows: list[dict[str, Any]] = []

    def add(kind: str, text: str, field: str) -> None:
        rows.append({
            "kind": kind,
            "text": text,
            "resolved": {"origin": _MIRROR_ORIGIN, "field": field},
            "source": "authored",
            "confidence": 1.0,
        })

    cur_fixed = profile.get("current_ctc_fixed_lpa")
    exp = profile.get("expected_ctc_lpa")
    if cur_fixed is not None or exp is not None:
        parts = []
        if cur_fixed is not None:
            var = profile.get("current_ctc_variable_lpa")
            parts.append(f"current fixed compensation ₹{cur_fixed:g} LPA"
                         + (f" (+₹{var:g} LPA variable)" if var else ""))
        if exp is not None:
            parts.append(f"expected fixed compensation ₹{exp:g} LPA")
        add("salary", "Compensation: " + "; ".join(parts) + ".", "ctc")

    if profile.get("notice_period_days") is not None:
        add("constraint", f"Notice period is {profile['notice_period_days']} days.", "notice_period_days")

    loc = profile.get("current_location")
    if loc:
        relo = profile.get("open_to_relocate")
        tail = " Open to relocation." if relo else (" Not open to relocation." if relo is False else "")
        add("constraint", f"Based in {loc}.{tail}", "location")

    tgt, ach = profile.get("sales_target"), profile.get("target_achievement")
    if tgt or ach:
        seg = []
        if tgt:
            seg.append(f"sales target: {tgt}")
        if ach:
            seg.append(f"achievement last year: {ach}")
        add("note", "Performance — " + "; ".join(seg) + ".", "performance")

    logos = profile.get("new_logos_last_year")
    if logos is not None:
        add("note", f"New logos added last year: {logos}.", "new_logos_last_year")

    if profile.get("reporting_manager"):
        add("note", f"Reporting manager: {profile['reporting_manager']}.", "reporting_manager")

    if profile.get("interview_availability"):
        add("note", f"Interview availability: {profile['interview_availability']}.", "interview_availability")

    if profile.get("reason_for_change"):
        add("note", f"Reason for a change: {profile['reason_for_change']}.", "reason_for_change")

    if profile.get("notes"):
        add("note", str(profile["notes"]), "notes")

    return rows


class CareerProfileRepository:
    def __init__(self, db: Client):
        self._db = db

    def get(self, user_id: str) -> tuple[dict[str, Any], str | None]:
        """(data, updated_at). Empty dict when no row yet (or pre-migration)."""
        row = safe_read(
            self._db.table("career_profile").select("data, updated_at").eq("user_id", user_id).maybe_single(),
            default=None,
            context="career_profile_get",
        )
        if not row:
            return {}, None
        return (row.get("data") or {}), row.get("updated_at")

    def write(self, user_id: str, data: dict[str, Any]) -> None:
        """Persist `data` as the authoritative full profile (one row per user).
        The caller owns merge + validation (the router merges the PATCH into the
        stored data and validates through CareerProfile before writing)."""
        (
            self._db.table("career_profile")
            .upsert({"user_id": user_id, "data": data, "updated_at": "now()"}, on_conflict="user_id")
            .execute()
        )

    def rebuild_prose_mirror(self, user_id: str, profile: dict[str, Any]) -> list[dict[str, Any]]:
        """Delete the prior career_profile-tagged user_memory rows and reinsert
        fresh prose for the current facts. Returns the inserted rows (with ids)
        so the caller can embed them off the response path."""
        (
            self._db.table("user_memory")
            .delete()
            .eq("user_id", user_id)
            .filter("resolved->>origin", "eq", _MIRROR_ORIGIN)
            .execute()
        )
        rows = _prose_rows(profile)
        if not rows:
            return []
        result = (
            self._db.table("user_memory")
            .insert([{**r, "user_id": user_id} for r in rows])
            .execute()
        )
        return result.data or []


def get_career_profile_repository(db: Client = Depends(get_user_db)) -> CareerProfileRepository:
    return CareerProfileRepository(db)
