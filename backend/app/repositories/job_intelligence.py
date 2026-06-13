from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.deps import get_user_db


class JobIntelligenceRepository:
    """Supabase adapter for the Job Intelligence module."""

    def __init__(self, admin_db: Client, user_db: Client | None = None) -> None:
        self.admin_db = admin_db
        self.user_db = user_db

    def latest_feed_publication(self) -> dict[str, Any] | None:
        result = (
            self.admin_db.table("job_feed_run_audits")
            .select("run_id, created_at, total_rows")
            .eq("status", "ok")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def latest_job_batch_marker(self) -> object:
        result = (
            self.admin_db.table("jobs")
            .select("last_seen")
            .order("last_seen", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("last_seen") if rows else None


def get_job_intelligence_repository(
    admin_db: Client = Depends(get_supabase_admin),
    user_db: Client = Depends(get_user_db),
) -> JobIntelligenceRepository:
    return JobIntelligenceRepository(admin_db=admin_db, user_db=user_db)
