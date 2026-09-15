"""Token-scoped repository for reach_targets (ADR-0018 Path 3)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.deps import get_user_db

_TABLE = "reach_targets"
_COLS = (
    "id, user_id, job_id, profile_url, display_name, company, role_title, "
    "status, connect_note, followup_note, referral_ask, sent_at, "
    "followup_due_at, replied_at, created_at, updated_at"
)


class ReachTargetsRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def count(self, user_id: str) -> int:
        result = (
            self._db.table(_TABLE)
            .select("id", count="exact")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return int(result.count or 0)

    def list_for_user(
        self,
        user_id: str,
        *,
        job_id: str | None = None,
        due_only: bool = False,
        now: datetime | None = None,
    ) -> list[dict[str, Any]]:
        query = self._db.table(_TABLE).select(_COLS).eq("user_id", user_id)
        if job_id:
            query = query.eq("job_id", job_id)
        if due_only:
            stamp = (now or datetime.now(timezone.utc)).isoformat()
            query = query.eq("status", "sent").lte("followup_due_at", stamp)
        result = query.order("created_at", desc=True).limit(80).execute()
        return result.data or []

    def get(self, user_id: str, target_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table(_TABLE)
            .select(_COLS)
            .eq("user_id", user_id)
            .eq("id", target_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def insert(self, row: dict[str, Any]) -> dict[str, Any]:
        result = self._db.table(_TABLE).insert(row).execute()
        rows = result.data or []
        if not rows:
            raise RuntimeError("reach_targets insert returned no row")
        return rows[0]

    def update(self, user_id: str, target_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        result = (
            self._db.table(_TABLE)
            .update(patch)
            .eq("user_id", user_id)
            .eq("id", target_id)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None


def get_token_reach_targets_repository(
    db: Client = Depends(get_user_db),
) -> ReachTargetsRepository:
    return ReachTargetsRepository(db)
