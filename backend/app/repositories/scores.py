from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin


@dataclass(frozen=True)
class ScoreRecomputeInputs:
    skill_level_map: dict[str, int]
    target_roles: list[str]


class ScoresRepository:
    def __init__(self, db: Client):
        self._db = db

    @property
    def client(self) -> Client:
        return self._db

    def get_mirror_score(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("mirror_scores")
            .select("*")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data or None

    def get_user_skill_level_map(self, user_id: str) -> dict[str, int]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, evidence_text, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return {
            row["skills"]["taxonomy_key"]: int(row["matched_level"])
            for row in result.data or []
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
        roles = ((result.data if result else {}) or {}).get("target_roles") or []
        return [str(role).strip() for role in roles if str(role).strip()]

    def get_recompute_inputs(self, user_id: str) -> ScoreRecomputeInputs:
        return ScoreRecomputeInputs(
            skill_level_map=self.get_user_skill_level_map(user_id),
            target_roles=self.get_target_roles(user_id),
        )

    def find_role_skill_rows(self, role: str) -> list[dict[str, Any]]:
        pattern = f"%{role}%"
        result = (
            self._db.table("jobs")
            .select("main_skills, side_skills")
            .ilike("job_title", pattern)
            .limit(100)
            .execute()
        )
        return result.data or []

    def list_market_skill_rows(self) -> list[dict[str, Any]]:
        page1 = self._db.table("jobs").select("main_skills, side_skills").range(0, 999).execute().data
        page2 = self._db.table("jobs").select("main_skills, side_skills").range(1000, 9999).execute().data
        return (page1 or []) + (page2 or [])

    def upsert_user_skill_rows(self, rows: list[dict[str, Any]]) -> None:
        if rows:
            self._db.table("user_skills").upsert(rows, on_conflict="user_id,skill_id").execute()

    def mirror_score_exists(self, user_id: str) -> bool:
        result = (
            self._db.table("mirror_scores")
            .select("user_id")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return bool(result and result.data)

    def update_mirror_score(self, user_id: str, payload: dict[str, Any]) -> None:
        self._db.table("mirror_scores").update(payload).eq("user_id", user_id).execute()

    def insert_mirror_score(self, user_id: str, payload: dict[str, Any]) -> None:
        self._db.table("mirror_scores").insert({"user_id": user_id, **payload}).execute()

    def append_score_history(self, user_id: str, total_score: float) -> None:
        self._db.table("mirror_score_history").insert(
            {
                "user_id": user_id,
                "total_score": total_score,
            }
        ).execute()

    def require_mirror_score(self, user_id: str) -> dict[str, Any]:
        result = self._db.table("mirror_scores").select("*").eq("user_id", user_id).single().execute()
        return result.data


def get_scores_repository(db: Client = Depends(get_supabase_admin)) -> ScoresRepository:
    return ScoresRepository(db)

