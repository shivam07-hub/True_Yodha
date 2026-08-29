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
    "description_text",
    "preview_payload",
    "generator_step",
    "generator_answers",
    "generated_draft",
    "result_seen_at",
    "completed_at",
    "activated_at",
    "activation_kind",
    "checklist_dismissed_at",
    "score_gap_reviewed_at",
    "credible_job_saved_at",
    "tailored_cv_created_at",
}


#: milestone name -> the column that records when it first happened. One table,
#: so both `mark_milestone` and `mark_milestone_once` name the same columns.
_MILESTONE_FIELDS: dict[str, str] = {
    "score_gap_reviewed": "score_gap_reviewed_at",
    "credible_job_saved": "credible_job_saved_at",
    "tailored_cv_created": "tailored_cv_created_at",
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
        # `result_seen_at` is NOT stamped here. It used to be, with the identical
        # timestamp as `completed_at`, which made the first-success checklist row
        # "Review your top roles" a tautology — it could only ever tick at the same
        # instant as everything else. It is stamped when the result actually
        # renders (`onboarding_service.get_result`).
        self.patch_state(
            user_id,
            {
                "completed_at": _now(),
                "description_text": None,
                "preview_payload": None,
                "accepted_file_metadata": {},
                "generator_answers": {},
                "generated_draft": None,
            },
        )

    def mark_activated(self, user_id: str, activation_kind: str) -> None:
        payload = {
            "activated_at": _now(),
            "activation_kind": activation_kind,
            "updated_at": _now(),
        }
        (
            self._db.table("user_onboarding_state")
            .update(payload)
            .eq("user_id", user_id)
            .is_("activated_at", "null")
            .execute()
        )

    def mark_milestone_once(self, user_id: str, milestone: str) -> bool:
        """Stamp a milestone only if it has never been stamped. Returns whether
        this call was the one that set it.

        `mark_milestone` overwrites, which is right for a thing that can happen
        again and wrong for a FIRST. `tailored_cv_created_at` is read as "when
        did this user first close the loop" — the Job Tracks gate — and a user
        who tailors weekly would otherwise carry a timestamp that is always
        today, making "have they ever" and "did they just" the same question.
        """
        state = self.get_state(user_id) or {}
        field = _MILESTONE_FIELDS.get(milestone)
        if field is None:
            raise ValueError(f"Unsupported onboarding milestone: {milestone}")
        if state.get(field):
            return False
        self.patch_state(user_id, {field: _now()})
        return True

    def mark_milestone(self, user_id: str, milestone: str) -> None:
        field = _MILESTONE_FIELDS.get(milestone)
        if field is None:
            raise ValueError(f"Unsupported onboarding milestone: {milestone}")
        self.patch_state(user_id, {field: _now()})

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
