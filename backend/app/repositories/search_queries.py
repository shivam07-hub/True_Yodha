"""search_queries — best-effort logging of user search intent + distiller reads.

Writes are fire-and-forget: a logging failure must NEVER break a search. Every
write is wrapped so a missing table (pre-migration) or transient error degrades
to a metric line, not a 500 (silent-degradation three-piece rule). Pass the
ADMIN client — the landing surface is anon and authed writes bypass RLS on
insert anyway; RLS still governs the user's own read.
"""
from __future__ import annotations

import logging
from typing import Any

from supabase import Client

from app.db_safe import safe_read

logger = logging.getLogger("myro.search_queries")


class SearchQueriesRepository:
    def __init__(self, db: Client):
        self._db = db

    def log(
        self,
        *,
        surface: str,
        query: str,
        user_id: str | None = None,
        session_id: str | None = None,
        parsed: dict[str, Any] | None = None,
        result_count: int | None = None,
    ) -> None:
        """Record one search. Best-effort — swallows all errors after a metric."""
        try:
            self._db.table("search_queries").insert(
                {
                    "user_id": user_id,
                    "session_id": session_id,
                    "surface": surface,
                    "query": query[:2000],
                    "parsed": parsed,
                    "result_count": result_count,
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001 — logging must never break search
            logger.warning(
                "metric search_log.failed surface=%s reason=%s", surface, exc.__class__.__name__
            )

    def list_since(self, user_id: str, since_iso: str | None, limit: int = 50) -> list[dict[str, Any]]:
        """The user's searches newer than `since_iso` (distiller signal source)."""
        query = (
            self._db.table("search_queries")
            .select("query, parsed, result_count, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
        )
        if since_iso:
            query = query.gt("created_at", since_iso)
        return safe_read(query, default=[], context="search_queries_list_since")
