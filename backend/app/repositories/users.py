from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user
from app.services.location_normalizer import normalize_location
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

    def update_profile(self, user_id: str, updates: dict[str, Any], *, email: str | None = None) -> None:
        """UPSERT the profile so PUT always succeeds even if the row was never seeded.

        email is required for the INSERT path (NOT NULL constraint); pass it from
        the JWT so the upsert never fails on a new row.
        """
        payload = {"id": user_id, **updates}
        if email:
            payload.setdefault("email", email)
        if "target_location" in payload:
            parsed = normalize_location(payload["target_location"])
            payload["target_location_country"] = parsed.location_country
        self._db.table("user_profiles").upsert(payload, on_conflict="id").execute()

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

    def ensure_profile_exists(
        self,
        user_id: str,
        *,
        email: str | None,
        full_name: str | None = None,
    ) -> None:
        """Idempotent: insert a user_profiles row if missing, no-op if present.

        Called from get_current_user so any authenticated request self-provisions
        its profile. Uses INSERT ... ON CONFLICT DO NOTHING so we never overwrite
        existing data.
        """
        if not email:
            return
        self._db.table("user_profiles").upsert(
            {
                "id": user_id,
                "email": email,
                "full_name": full_name,
            },
            on_conflict="id",
            ignore_duplicates=True,
        ).execute()

    def get_followed_companies(self, user_id: str) -> list[dict]:
        result = (
            self._db.table("followed_companies")
            .select("company_name, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    def follow_company(self, user_id: str, company_name: str) -> None:
        self._db.table("followed_companies").upsert(
            {"user_id": user_id, "company_name": company_name.strip()},
            on_conflict="user_id,company_name",
            ignore_duplicates=True,
        ).execute()

    def unfollow_company(self, user_id: str, company_name: str) -> None:
        self._db.table("followed_companies").delete().eq("user_id", user_id).eq("company_name", company_name).execute()

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

