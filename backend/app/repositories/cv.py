from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_for_token
from app.deps import get_current_user


class CVRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    @property
    def client(self) -> Client:
        return self._db

    # ── user_profiles ─────────────────────────────────────────────────────────

    def get_cv_profile_fields(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("user_profiles")
            .select("cv_raw_text, cv_parsed_at")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return (result.data if result else None) or None

    def get_cv_raw_text(self, user_id: str) -> str | None:
        result = (
            self._db.table("user_profiles")
            .select("cv_raw_text")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return ((result.data if result else None) or {}).get("cv_raw_text")

    def update_cv_profile(self, user_id: str, updates: dict[str, Any]) -> None:
        self._db.table("user_profiles").update(updates).eq("id", user_id).execute()

    # ── cv_history ─────────────────────────────────────────────────────────────

    def list_cv_history(self, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        result = (
            self._db.table("cv_history")
            .select("*")
            .eq("user_id", user_id)
            .order("uploaded_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def next_version_number(self, user_id: str) -> int:
        result = (
            self._db.table("cv_history")
            .select("version_number")
            .eq("user_id", user_id)
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return 1
        return int(result.data[0].get("version_number") or 0) + 1

    def latest_cv_version(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("cv_history")
            .select("*")
            .eq("user_id", user_id)
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def find_by_content_hash(self, user_id: str, content_hash: str) -> dict[str, Any] | None:
        result = (
            self._db.table("cv_history")
            .select("skills_count, mirror_score")
            .eq("user_id", user_id)
            .eq("content_hash", content_hash)
            .order("uploaded_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def insert_cv_history(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        result = self._db.table("cv_history").insert(payload).execute()
        return result.data[0] if result.data else None

    def update_cv_history_structured(
        self, history_id: int, cv_structured: dict[str, Any]
    ) -> None:
        """Persist a lazy-backfilled cv_structured payload onto an existing history row."""
        self._db.table("cv_history").update(
            {"cv_structured": cv_structured}
        ).eq("id", history_id).execute()

    # ── evidence summary reads ────────────────────────────────────────────────

    def list_milestones(self, user_id: str, limit: int = 120) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_milestones")
            .select("*")
            .eq("user_id", user_id)
            .order("milestone_date", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def list_diary_log_dates(self, user_id: str, limit: int = 120) -> list[dict[str, Any]]:
        result = (
            self._db.table("daily_logs")
            .select("id, log_date")
            .eq("user_id", user_id)
            .order("log_date", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def list_user_skill_sources(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("id, source, last_updated")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def count_user_skills(self, user_id: str) -> int:
        result = (
            self._db.table("user_skills")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        return len(result.data or [])

    def get_current_score(self, user_id: str) -> float | None:
        result = (
            self._db.table("mirror_scores")
            .select("total_score")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data:
            return result.data.get("total_score")
        return None


def get_token_cv_repository(
    current_user: dict = Depends(get_current_user),
) -> CVRepository:
    return CVRepository(get_supabase_for_token(current_user["token"]))
