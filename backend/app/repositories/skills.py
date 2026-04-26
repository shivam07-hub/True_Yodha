from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase


@dataclass(frozen=True)
class SkillRecord:
    id: int
    taxonomy_key: str
    display_name: str
    lightcast_id: str | None
    l1_domain: str
    l2_cluster: str


class SkillsRepository:
    def __init__(self, db: Client):
        self._db = db

    def list_active_skills(self) -> list[SkillRecord]:
        result = (
            self._db.table("skills")
            .select("id, taxonomy_key, display_name, lightcast_id, l1_domain, l2_cluster")
            .eq("is_active", True)
            .order("display_name")
            .execute()
        )
        return [self._skill_record(row) for row in result.data or []]

    def list_active_domains(self) -> list[str]:
        result = (
            self._db.table("skills")
            .select("l1_domain")
            .eq("is_active", True)
            .execute()
        )
        return sorted({row["l1_domain"] for row in result.data or [] if row.get("l1_domain")})

    def _skill_record(self, row: dict[str, Any]) -> SkillRecord:
        return SkillRecord(
            id=row["id"],
            taxonomy_key=row["taxonomy_key"],
            display_name=row["display_name"],
            lightcast_id=row.get("lightcast_id"),
            l1_domain=row.get("l1_domain") or "General",
            l2_cluster=row.get("l2_cluster") or "General",
        )


def get_skills_repository(db: Client = Depends(get_supabase)) -> SkillsRepository:
    return SkillsRepository(db)

