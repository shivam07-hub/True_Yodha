"""Token-scoped repository for user_connections (backlog #35 slice 5).

The user's own uploaded LinkedIn connections, used only to surface warm intros
at a target company. RLS scopes every row to the caller; the explicit user_id
filters are defensive.
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.deps import get_user_db

_TABLE = "user_connections"


class ConnectionsRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def count(self, user_id: str) -> int:
        result = (
            self._db.table(_TABLE)
            .select("id", count="exact")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return int(result.count or 0)

    def replace_all(self, user_id: str, rows: list[dict[str, Any]]) -> int:
        """Re-upload semantics: clear the user's set, then insert the new one.
        Returns the number inserted."""
        self._db.table(_TABLE).delete().eq("user_id", user_id).execute()
        if not rows:
            return 0
        payload = [
            {
                "user_id": user_id,
                "full_name": r["full_name"],
                "company": r.get("company"),
                "position": r.get("position"),
                "connected_on": r.get("connected_on"),
            }
            for r in rows
        ]
        # Chunk inserts so a large export doesn't exceed request limits.
        inserted = 0
        for i in range(0, len(payload), 500):
            chunk = payload[i : i + 500]
            self._db.table(_TABLE).insert(chunk).execute()
            inserted += len(chunk)
        return inserted

    def clear(self, user_id: str) -> None:
        self._db.table(_TABLE).delete().eq("user_id", user_id).execute()

    def find_at_company(self, user_id: str, company: str, limit: int = 5) -> list[dict[str, Any]]:
        """Connections whose company matches (case-insensitive substring) the
        target. Empty when the user uploaded nothing or knows no one there."""
        company = (company or "").strip()
        if not company:
            return []
        result = (
            self._db.table(_TABLE)
            .select("full_name, company, position")
            .eq("user_id", user_id)
            .ilike("company", f"%{company}%")
            .limit(limit)
            .execute()
        )
        return result.data or []


def get_token_connections_repository(db: Client = Depends(get_user_db)) -> ConnectionsRepository:
    return ConnectionsRepository(db)
