"""cv_dump — the persistent brain-dump notebook (User Memory Phase 3).

Own-only CRUD over `cv_dump_entries`. RLS enforces `auth.uid() = user_id`; every
query also filters user_id for defence-in-depth. `safe_read` degrades the
pre-migration PGRST205 to an empty list so reads never 500 before 20260706f lands.
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db


class CvDumpRepository:
    def __init__(self, db: Client):
        self._db = db

    def add(self, user_id: str, text: str, source: str = "manual") -> dict[str, Any]:
        result = (
            self._db.table("cv_dump_entries")
            .insert({"user_id": user_id, "text": text, "source": source})
            .execute()
        )
        return (result.data or [{}])[0]

    def list_recent(self, user_id: str, limit: int = 30) -> list[dict[str, Any]]:
        return safe_read(
            self._db.table("cv_dump_entries")
            .select("id, text, source, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit),
            default=[],
            context="cv_dump_list",
        )

    def list_since(self, user_id: str, since_iso: str, limit: int = 50) -> list[dict[str, Any]]:
        """New entries since the distiller watermark (Phase-2 signal source)."""
        return safe_read(
            self._db.table("cv_dump_entries")
            .select("text, created_at")
            .eq("user_id", user_id)
            .gt("created_at", since_iso)
            .order("created_at", desc=True)
            .limit(limit),
            default=[],
            context="cv_dump_since",
        )

    def delete(self, user_id: str, entry_id: str) -> None:
        self._db.table("cv_dump_entries").delete().eq("user_id", user_id).eq("id", entry_id).execute()


def get_cv_dump_repository(db: Client = Depends(get_user_db)) -> CvDumpRepository:
    return CvDumpRepository(db)
