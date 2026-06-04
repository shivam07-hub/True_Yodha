from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db


class CommentsRepository:
    """Token-scoped CRUD for private note threads. RLS enforces own-only access
    (see migration 20260531_comments) — every query also filters by user_id for
    defence-in-depth and so admin clients behave the same way."""

    def __init__(self, db: Client):
        self._db = db

    def list_for_entity(self, user_id: str, entity_type: str, entity_id: str) -> list[dict[str, Any]]:
        # The comments table migration (20260531_comments) is manual-apply; until
        # it lands, PostgREST returns PGRST205 ("table not in schema cache").
        # safe_read degrades that to an empty thread instead of 500ing the card.
        return safe_read(
            self._db.table("comments")
            .select("*")
            .eq("user_id", user_id)
            .eq("entity_type", entity_type)
            .eq("entity_id", entity_id)
            .order("created_at", desc=True),
            default=[],
            context="comments_list_for_entity",
        )

    def create(self, user_id: str, entity_type: str, entity_id: str, body: str) -> dict[str, Any]:
        result = (
            self._db.table("comments")
            .insert(
                {
                    "user_id": user_id,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "body": body,
                }
            )
            .execute()
        )
        return (result.data or [{}])[0]

    def update(self, user_id: str, comment_id: str, body: str) -> dict[str, Any] | None:
        result = (
            self._db.table("comments")
            .update({"body": body, "updated_at": "now()"})
            .eq("id", comment_id)
            .eq("user_id", user_id)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def delete(self, user_id: str, comment_id: str) -> bool:
        result = (
            self._db.table("comments")
            .delete()
            .eq("id", comment_id)
            .eq("user_id", user_id)
            .execute()
        )
        return bool(result.data)


def get_token_comments_repository(db: Client = Depends(get_user_db)) -> CommentsRepository:
    return CommentsRepository(db)
