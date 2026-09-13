"""cv_dump — the write seam for the reservoir's inflow ledger.

Own-only over `cv_dump_entries`. RLS enforces `auth.uid() = user_id`; every query
also filters user_id for defence-in-depth. `safe_read` degrades the pre-migration
PGRST205 to an empty list so reads never 500 before 20260706f lands.

This began as the brain-dump notebook's CRUD (User Memory Phase 3). The notebook
was never given a nav entry and never took a single row in production, so it was
deleted 2026-09-12 along with `list_recent` and `delete`, which only it called.
What survives is what other surfaces use: `add`, the one way an inflow is
written, and `list_since`, the distiller's fourth signal.

The processing side of the same table — pending, processed, skipped — belongs to
`CareerReservoirRepository`, which owns the inflow ledger.
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

    def add(
        self,
        user_id: str,
        text: str,
        source: str = "manual",
        *,
        kind: str = "note",
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """`kind` carries inflow intent, not only payload shape (20260912130000):
        'note' = the user's words, which nothing extracts; 'file' / 'linkedin' /
        'answer' = the story extractor reads it, so the caller MUST also
        `career_reservoir.enqueue_ingest`. See repositories.career_reservoir.
        INFLOW_KINDS — and the CHECK constraint, which allows only these four."""
        row: dict[str, Any] = {"user_id": user_id, "text": text, "source": source, "kind": kind}
        if payload:
            row["payload"] = payload
        result = self._db.table("cv_dump_entries").insert(row).execute()
        return (result.data or [{}])[0]

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


def get_cv_dump_repository(db: Client = Depends(get_user_db)) -> CvDumpRepository:
    return CvDumpRepository(db)
