"""user_memory — token-scoped CRUD for the caller's OWN memory facts.

The persistent "knows me" store (User Memory Phase 1). Own-only end to end: RLS
enforces `auth.uid() = user_id` and every query also filters user_id for
defence-in-depth. `safe_read` degrades the pre-migration PGRST205 to an empty
list so reads never 500 before 20260706b lands.
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db


class UserMemoryRepository:
    def __init__(self, db: Client):
        self._db = db

    def list_active(self, user_id: str, kinds: list[str] | None = None) -> list[dict[str, Any]]:
        query = (
            self._db.table("user_memory")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
        )
        if kinds:
            query = query.in_("kind", kinds)
        return safe_read(query, default=[], context="user_memory_list")

    def add(
        self,
        user_id: str,
        *,
        kind: str,
        text: str,
        resolved: dict[str, Any] | None = None,
        source: str = "authored",
        confidence: float | None = None,
    ) -> dict[str, Any]:
        result = (
            self._db.table("user_memory")
            .insert(
                {
                    "user_id": user_id,
                    "kind": kind,
                    "text": text,
                    "resolved": resolved,
                    "source": source,
                    "confidence": confidence,
                }
            )
            .execute()
        )
        return (result.data or [{}])[0]

    def update(self, user_id: str, memory_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        result = (
            self._db.table("user_memory")
            .update({**updates, "updated_at": "now()"})
            .eq("user_id", user_id)
            .eq("id", memory_id)
            .execute()
        )
        return (result.data or [None])[0]

    def delete(self, user_id: str, memory_id: str) -> None:
        self._db.table("user_memory").delete().eq("user_id", user_id).eq("id", memory_id).execute()

    def set_embedding(self, user_id: str, memory_id: str, vector_literal: str) -> None:
        """Store a fact's pgvector embedding (Phase 4). `vector_literal` is the
        '[a,b,c]' string form (embeddings.to_pgvector). Own-scoped."""
        (
            self._db.table("user_memory")
            .update({"embedding": vector_literal})
            .eq("user_id", user_id)
            .eq("id", memory_id)
            .execute()
        )


def get_user_memory_repository(db: Client = Depends(get_user_db)) -> UserMemoryRepository:
    return UserMemoryRepository(db)
