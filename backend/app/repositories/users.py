from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user
from app.services.scoring_engine import _PROFICIENCY_TITLES


@dataclass(frozen=True)
class UserSkillRecord:
    key: str
    display_name: str
    level: int
    proficiency_title: str
    evidence_text: str | None


class UsersRepository:
    def __init__(self, db: Client):
        self._db = db

    def get_profile(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("user_profiles")
            .select("*")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return (result.data if result else None) or None

    def update_profile(self, user_id: str, updates: dict[str, Any]) -> None:
        self._db.table("user_profiles").update(updates).eq("id", user_id).execute()

    def list_user_skill_records(self, user_id: str) -> list[UserSkillRecord]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, proficiency_title, evidence_text, skills(taxonomy_key, display_name)")
            .eq("user_id", user_id)
            .execute()
        )
        records = []
        for row in result.data or []:
            if not row.get("skills"):
                continue
            skill = row["skills"]
            key = skill["taxonomy_key"]
            level = int(row["matched_level"])
            records.append(
                UserSkillRecord(
                    key=key,
                    display_name=skill.get("display_name") or key,
                    level=level,
                    proficiency_title=row.get("proficiency_title")
                    or _PROFICIENCY_TITLES.get(level, "Scout"),
                    evidence_text=row.get("evidence_text") or None,
                )
            )
        return records


    def get_skill_id_by_taxonomy_key(self, taxonomy_key: str) -> int | None:
        result = (
            self._db.table("skills")
            .select("id")
            .eq("taxonomy_key", taxonomy_key)
            .maybe_single()
            .execute()
        )
        if not result or not result.data:
            return None
        return int(result.data["id"])

    def correct_skill_level(self, user_id: str, skill_id: int, new_level: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self._db.table("user_skills").upsert(
            {
                "user_id": user_id,
                "skill_id": skill_id,
                "matched_level": new_level,
                "source": "user_correction",
                "last_updated": now,
            },
            on_conflict="user_id,skill_id",
        ).execute()


def get_admin_users_repository(db: Client = Depends(get_supabase_admin)) -> UsersRepository:
    return UsersRepository(db)


def get_token_users_repository(
    current_user: dict = Depends(get_current_user),
) -> UsersRepository:
    return UsersRepository(get_supabase_for_token(current_user["token"]))

