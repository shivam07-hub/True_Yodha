from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.deps import get_user_db


class DiaryRepository:
    def __init__(self, db: Client):
        self._db = db

    @property
    def client(self) -> Client:
        return self._db

    def get_total_score(self, user_id: str) -> float | None:
        result = (
            self._db.table("mirror_scores")
            .select("total_score")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None or not result.data:
            return None
        return result.data["total_score"]

    def get_daily_log_for_append(self, user_id: str, log_date: date) -> dict[str, Any] | None:
        result = (
            self._db.table("daily_logs")
            .select("entry_text, skills_delta")
            .eq("user_id", user_id)
            .eq("log_date", str(log_date))
            .maybe_single()
            .execute()
        )
        return result.data if result is not None and result.data else None

    def upsert_daily_log(self, payload: dict[str, Any]) -> None:
        self._db.table("daily_logs").upsert(
            payload,
            on_conflict="user_id,log_date",
        ).execute()

    def get_daily_log(self, user_id: str, log_date: date) -> dict[str, Any] | None:
        result = (
            self._db.table("daily_logs")
            .select("*")
            .eq("user_id", user_id)
            .eq("log_date", str(log_date))
            .maybe_single()
            .execute()
        )
        return result.data if result else None

    def list_daily_logs(self, user_id: str, limit: int) -> list[dict[str, Any]]:
        result = (
            self._db.table("daily_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("log_date", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def list_user_milestones(self, user_id: str, limit: int) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_milestones")
            .select("*")
            .eq("user_id", user_id)
            .order("milestone_date", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def upsert_user_milestone(self, payload: dict[str, Any]) -> None:
        self._db.table("user_milestones").upsert(
            payload,
            on_conflict="user_id,milestone_date",
        ).execute()

    def get_user_milestone(self, user_id: str, milestone_date: date) -> dict[str, Any] | None:
        result = (
            self._db.table("user_milestones")
            .select("*")
            .eq("user_id", user_id)
            .eq("milestone_date", str(milestone_date))
            .maybe_single()
            .execute()
        )
        return result.data if result else None

    def skill_ids_by_taxonomy_key(self) -> dict[str, int]:
        result = self._db.table("skills").select("id, taxonomy_key").execute()
        return {row["taxonomy_key"]: row["id"] for row in result.data or []}

    def user_skill_levels_by_skill_id(self, user_id: str) -> dict[int, int]:
        result = (
            self._db.table("user_skills")
            .select("skill_id, matched_level")
            .eq("user_id", user_id)
            .execute()
        )
        return {row["skill_id"]: row["matched_level"] for row in result.data or []}

    def list_user_skill_rows(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("skill_id, matched_level, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def list_user_skill_keys(self, user_id: str) -> list[str]:
        return [
            row["skills"]["taxonomy_key"]
            for row in self.list_user_skill_rows(user_id)
            if row.get("skills") and row["skills"].get("taxonomy_key")
        ]

    def get_user_skill_level_map(self, user_id: str) -> dict[str, int]:
        rows = self.list_user_skill_rows(user_id)
        return {
            row["skills"]["taxonomy_key"]: int(row.get("matched_level") or 0)
            for row in rows
            if row.get("skills") and row["skills"].get("taxonomy_key")
        }

    def get_target_roles(self, user_id: str) -> list[str]:
        result = (
            self._db.table("user_profiles")
            .select("target_roles")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        raw_roles = ((result.data if result else {}) or {}).get("target_roles") or []
        return [str(role).strip() for role in raw_roles if str(role).strip()]

    def upsert_user_skill_rows(self, rows: list[dict[str, Any]]) -> None:
        if rows:
            self._db.table("user_skills").upsert(rows, on_conflict="user_id,skill_id").execute()


def get_admin_diary_repository(db: Client = Depends(get_supabase_admin)) -> DiaryRepository:
    return DiaryRepository(db)


def get_token_diary_repository(db: Client = Depends(get_user_db)) -> DiaryRepository:
    return DiaryRepository(db)
