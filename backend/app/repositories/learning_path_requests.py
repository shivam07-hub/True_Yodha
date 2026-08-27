"""Learning-path demand requests: idempotent, withdrawable, owner-scoped."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client


class LearningPathRequests:
    def __init__(self, db: Client) -> None:
        self._db = db

    def active_by_key(self, user_id: str) -> dict[str, dict[str, Any]]:
        rows = (
            self._db.table("learning_path_requests")
            .select("*")
            .eq("user_id", user_id)
            .is_("withdrawn_at", "null")
            .execute()
        ).data or []
        return {str(row["taxonomy_key"]): row for row in rows if row.get("taxonomy_key")}

    def request(
        self,
        user_id: str,
        taxonomy_key: str,
        *,
        skill_id: int | None,
        snapshot_id: str | None,
        seniority: str | None,
    ) -> tuple[dict[str, Any], bool]:
        """Return (row, created). Idempotent on the active unique key."""
        existing = self.active_by_key(user_id).get(taxonomy_key)
        if existing:
            return existing, False
        row = {
            "user_id": user_id,
            "taxonomy_key": taxonomy_key,
            "skill_id": skill_id,
            "target_snapshot_id": snapshot_id,
            "seniority": seniority,
        }
        created = self._db.table("learning_path_requests").insert(row).execute().data or []
        return (created[0] if created else row), True

    def withdraw(self, user_id: str, taxonomy_key: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        result = (
            self._db.table("learning_path_requests")
            .update({"withdrawn_at": now})
            .eq("user_id", user_id)
            .eq("taxonomy_key", taxonomy_key)
            .is_("withdrawn_at", "null")
            .execute()
        )
        return bool(result.data)

    def pending_unfulfilled(self) -> list[dict[str, Any]]:
        return (
            self._db.table("learning_path_requests")
            .select("*")
            .is_("withdrawn_at", "null")
            .is_("fulfilled_at", "null")
            .execute()
        ).data or []

    def mark_fulfilled(self, request_id: str, notification_id: int | None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self._db.table("learning_path_requests").update(
            {
                "fulfilled_at": now,
                "fulfillment_notification_id": notification_id,
            }
        ).eq("id", request_id).is_("fulfilled_at", "null").execute()
