"""Durable onboarding state and baseline-scoped skill overrides."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client


# `status` and `current_stage` are NOT here, deliberately. They were a stored copy
# of a position the journey already derives from its own facts — written in 13
# places, read for a decision in 2 — and `patch_state` now REJECTS them, so the
# copy cannot quietly come back. See `journey_position`.
_STATE_FIELDS = {
    "entry_mode",
    "upload_job_id",
    "accepted_file_metadata",
    "generator_step",
    "generator_answers",
    "generated_draft",
    "completed_at",
    "checklist_dismissed_at",
    "credible_job_saved_at",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class OnboardingRepository:
    """Admin-backed writes with explicit user ownership on every operation."""

    def __init__(self, db: Client) -> None:
        self._db = db

    def get_state(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("user_onboarding_state")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def patch_state(self, user_id: str, updates: dict[str, Any]) -> None:
        unknown = set(updates) - _STATE_FIELDS
        if unknown:
            fields = ", ".join(sorted(unknown))
            raise ValueError(f"Unsupported onboarding state fields: {fields}")
        payload = {"user_id": user_id, **updates, "updated_at": _now()}
        (
            self._db.table("user_onboarding_state")
            .upsert(payload, on_conflict="user_id")
            .execute()
        )

    def save_generator_answer(
        self,
        user_id: str,
        step: int,
        answer: dict[str, Any],
    ) -> None:
        state = self.get_state(user_id) or {}
        answers = dict(state.get("generator_answers") or {})
        answers[str(step)] = answer
        self.patch_state(
            user_id,
            {"generator_step": step, "generator_answers": answers},
        )

    def save_generated_draft(self, user_id: str, draft: str) -> None:
        self.patch_state(user_id, {"generated_draft": draft})

    def mark_completed(self, user_id: str) -> None:
        self.patch_state(
            user_id,
            {
                "completed_at": _now(),
                "accepted_file_metadata": {},
                "generator_answers": {},
                "generated_draft": None,
            },
        )

    def mark_job_saved(self, user_id: str) -> None:
        self.patch_state(user_id, {"credible_job_saved_at": _now()})

    def dismiss_checklist(self, user_id: str) -> None:
        self.patch_state(user_id, {"checklist_dismissed_at": _now()})

    def list_skill_overrides(
        self,
        user_id: str,
        baseline_version_id: int,
    ) -> list[dict[str, Any]]:
        result = (
            self._db.table("cv_skill_overrides")
            .select("*")
            .eq("user_id", user_id)
            .eq("baseline_version_id", baseline_version_id)
            .execute()
        )
        return result.data or []

    def replace_skill_overrides(
        self,
        user_id: str,
        baseline_version_id: int,
        overrides: list[dict[str, Any]],
    ) -> None:
        (
            self._db.table("cv_skill_overrides")
            .delete()
            .eq("user_id", user_id)
            .eq("baseline_version_id", baseline_version_id)
            .execute()
        )
        if not overrides:
            return
        rows = [
            {
                "user_id": user_id,
                "baseline_version_id": baseline_version_id,
                "skill_id": int(item["skill_id"]),
                "action": item["action"],
                "evidence_text": item["evidence_text"],
                "source_location": item.get("source_location") or {},
            }
            for item in overrides
        ]
        (
            self._db.table("cv_skill_overrides")
            .upsert(
                rows,
                on_conflict="user_id,baseline_version_id,skill_id",
            )
            .execute()
        )
