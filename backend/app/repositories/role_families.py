"""Read models for verified, skill-derived job role families."""

from __future__ import annotations

from typing import Any

from supabase import Client


class RoleFamiliesRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def list_families(self, user_id: str, *, query: str | None = None, limit: int = 3) -> list[dict[str, Any]]:
        skill_rows = (
            self._db.table("user_skills")
            .select("skill_id")
            .eq("user_id", user_id)
            .execute()
            .data
            or []
        )
        skill_ids = [int(row["skill_id"]) for row in skill_rows if row.get("skill_id") is not None]
        response = self._db.rpc(
            "list_role_families",
            {"p_skill_ids": skill_ids, "p_query": query, "p_limit": limit},
        ).execute()
        return response.data or []

    def list_locations(self, family: str, *, query: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
        response = self._db.rpc(
            "list_role_family_locations",
            {"p_family": family, "p_query": query, "p_limit": limit},
        ).execute()
        return response.data or []

    def aspiration_skills(self, families: list[str]) -> dict[str, int]:
        if not families:
            return {}
        rows = self._db.rpc(
            "role_family_aspiration_skills", {"p_families": families}
        ).execute().data or []
        aspiration: dict[str, int] = {}
        for row in rows:
            key = str(row.get("taxonomy_key") or "").strip()
            total = int(row.get("job_count") or 0)
            primary_count = int(row.get("primary_job_count") or 0)
            if not key or not total:
                continue
            if primary_count:
                aspiration[key] = 4 if primary_count / total > 0.5 else 3
            elif row.get("has_side_skill"):
                aspiration[key] = 2
        return aspiration
