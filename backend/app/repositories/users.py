from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_profile_update
from app.deps import get_user_db
from app.repositories.jobs import clear_user_target_locations_cache
from app.services.location_normalizer import derive_location_columns
from app.services.scoring import _PROFICIENCY_TITLES


def _sync_location_columns(payload: dict[str, Any]) -> None:
    """In-place: if a write touches location, recompute all four columns from
    one canonical source (array preferred, else the legacy single string)."""
    if "target_locations" in payload:
        source = payload["target_locations"] or []
    elif "target_location" in payload:
        single = payload["target_location"]
        source = [single] if single else []
    else:
        return
    payload.update(derive_location_columns(list(source)))


@dataclass(frozen=True)
class UserSkillRecord:
    key: str
    display_name: str
    level: int
    proficiency_title: str
    evidence_text: str | None
    forge_sessions_count: int
    forged_level_up_available: bool
    description: str | None = None  # Lightcast definition from skills.description


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

    def has_baseline_cv(self, user_id: str) -> bool:
        """True iff the user owns at least one baseline cv_versions row.

        Canonical signal for the `<RequiresCV>` boundary primitive. Replaces
        the dropped `user_profiles.cv_parsed_at` column (removed in
        20260518_cv_versions_unify) — that field's absence silently broke
        the gate so every CV-uploaded user kept seeing the upload nag on
        Forge / Skills.
        """
        result = (
            self._db.table("cv_versions")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .limit(1)
            .execute()
        )
        return (result.count or 0) > 0

    def latest_cv_upload_job(self, user_id: str) -> dict[str, Any] | None:
        """Newest async CV upload job for this user (if any).

        The Job Refresh and CV Upload seams are intentionally decoupled; this
        read is only for route-level UX state (processing vs failed), not for
        scoring or matching logic.
        """
        result = (
            self._db.table("cv_upload_jobs")
            .select("id, status, error_code, created_at, finished_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def update_profile(self, user_id: str, updates: dict[str, Any]) -> None:
        payload = dict(updates)
        touches_location = "target_locations" in payload or "target_location" in payload
        _sync_location_columns(payload)
        # Tolerant write: survives schema-cache lag so the profile still saves
        # if a derived location column hasn't been migrated yet (harden-first,
        # then migrate). Legacy scalar columns persist regardless.
        safe_profile_update(
            self._db.table("user_profiles"),
            payload,
            match_column="id",
            match_value=user_id,
            context="update_profile",
        )
        if touches_location:
            clear_user_target_locations_cache(user_id)

    def list_user_skill_records(self, user_id: str) -> list[UserSkillRecord]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, proficiency_title, evidence_text, forge_sessions_count, skills(taxonomy_key, display_name, description)")
            .eq("user_id", user_id)
            .execute()
        )
        forged_level_up_keys = self.list_forged_level_up_skill_keys(user_id)
        records = []
        for row in result.data or []:
            if not row.get("skills"):
                continue
            skill = row["skills"]
            key = skill["taxonomy_key"]
            level = int(row["matched_level"])
            forge_sessions_count = int(row.get("forge_sessions_count") or 0)
            records.append(
                UserSkillRecord(
                    key=key,
                    display_name=skill.get("display_name") or key,
                    level=level,
                    proficiency_title=row.get("proficiency_title")
                    or _PROFICIENCY_TITLES.get(level, "Scout"),
                    evidence_text=row.get("evidence_text") or None,
                    forge_sessions_count=forge_sessions_count,
                    forged_level_up_available=key in forged_level_up_keys,
                    description=skill.get("description"),
                )
            )
        return records

    def list_forged_level_up_skill_keys(self, user_id: str) -> set[str]:
        result = (
            self._db.table("forge_sessions")
            .select("skill_name, level_before, level_after")
            .eq("user_id", user_id)
            .order("completed_at", desc=True)
            .limit(500)
            .execute()
        )
        keys: set[str] = set()
        for row in result.data or []:
            level_before = int(row.get("level_before") or 0)
            level_after = int(row.get("level_after") or 0)
            skill_name = str(row.get("skill_name") or "").strip()
            if skill_name and level_after > level_before:
                keys.add(skill_name)
        return keys

    def has_forged_level_up(self, user_id: str, taxonomy_key: str) -> bool:
        return taxonomy_key in self.list_forged_level_up_skill_keys(user_id)

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

    def list_practice_saves(self, user_id: str) -> list[dict]:
        result = (
            self._db.table("practice_saves")
            .select("skill_key, display_name, source, saved_at")
            .eq("user_id", user_id)
            .order("saved_at", desc=True)
            .execute()
        )
        return result.data or []

    def add_practice_save(self, user_id: str, skill_key: str, display_name: str, source: str) -> None:
        self._db.table("practice_saves").upsert(
            {
                "user_id": user_id,
                "skill_key": skill_key.strip(),
                "display_name": display_name.strip(),
                "source": source,
            },
            on_conflict="user_id,skill_key",
            ignore_duplicates=True,
        ).execute()

    def remove_practice_save(self, user_id: str, skill_key: str) -> None:
        self._db.table("practice_saves").delete().eq("user_id", user_id).eq("skill_key", skill_key).execute()


def get_admin_users_repository(db: Client = Depends(get_supabase_admin)) -> UsersRepository:
    return UsersRepository(db)


def get_token_users_repository(db: Client = Depends(get_user_db)) -> UsersRepository:
    return UsersRepository(db)
