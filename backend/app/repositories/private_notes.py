"""private_notes — token-scoped CRUD for the caller's OWN private note per entity.

One living note per (user, entity_type, entity_id) — upsert, not a thread. Unlike
`comments` (public community feed), this is NEVER exposed to anyone but the author:
there is no service-role public read repo, no ninja_name join, no feed. Backs the
CV-intake "save my raw story" flow so a user's brain-dump is durable AND private
(PV1). RLS enforces own-only; every query also filters user_id for defence-in-depth.
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db


class PrivateNotesRepository:
    def __init__(self, db: Client):
        self._db = db

    def get(self, user_id: str, entity_type: str, entity_id: str) -> dict[str, Any] | None:
        # The migration (20260702_private_notes) is manual-apply; until it lands
        # PostgREST returns PGRST205 — safe_read degrades that to "no note" (None)
        # rather than 500ing the intake modal.
        rows = safe_read(
            self._db.table("private_notes")
            .select("*")
            .eq("user_id", user_id)
            .eq("entity_type", entity_type)
            .eq("entity_id", entity_id)
            .limit(1),
            default=[],
            context="private_notes_get",
        )
        return rows[0] if rows else None

    def upsert(self, user_id: str, entity_type: str, entity_id: str, body: str) -> dict[str, Any]:
        # UNIQUE(user_id, entity_type, entity_id) makes this a single living note:
        # on_conflict updates the body + updated_at in place, never appends.
        result = (
            self._db.table("private_notes")
            .upsert(
                {
                    "user_id": user_id,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "body": body,
                    "updated_at": "now()",
                },
                on_conflict="user_id,entity_type,entity_id",
            )
            .execute()
        )
        return (result.data or [{}])[0]


def get_private_notes_repository(db: Client = Depends(get_user_db)) -> PrivateNotesRepository:
    return PrivateNotesRepository(db)
