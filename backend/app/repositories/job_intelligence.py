from __future__ import annotations

from typing import Any

from fastapi import Depends
from postgrest.exceptions import APIError
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_read
from app.deps import get_user_db

_FEEDBACK_COLUMNS = (
    "id, client_event_id, job_id, user_id, feedback_kind, reason_code, "
    "surface, created_at"
)


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

    def find_feedback(
        self,
        user_id: str,
        client_event_id: str,
    ) -> dict[str, Any] | None:
        if self.user_db is None:
            raise RuntimeError("Feedback writes require an RLS-scoped database")
        return safe_read(
            self.user_db.table("job_feedback_events")
            .select(_FEEDBACK_COLUMNS)
            .eq("user_id", user_id)
            .eq("client_event_id", client_event_id)
            .maybe_single(),
            default=None,
            context="job_feedback_by_client_event_id",
        )

    def count_quality_feedback_since(
        self,
        user_id: str,
        since: Any,
    ) -> int:
        if self.user_db is None:
            raise RuntimeError("Feedback writes require an RLS-scoped database")
        result = (
            self.user_db.table("job_feedback_events")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("feedback_kind", "quality")
            .gte("created_at", since.isoformat())
            .execute()
        )
        return int(result.count or 0)

    def insert_feedback(
        self,
        payload: dict[str, Any],
    ) -> tuple[dict[str, Any], bool]:
        if self.user_db is None:
            raise RuntimeError("Feedback writes require an RLS-scoped database")
        try:
            result = (
                self.user_db.table("job_feedback_events")
                .insert(payload)
                .execute()
            )
        except APIError as exc:
            if getattr(exc, "code", None) != "23505":
                raise
            existing = self.find_feedback(
                str(payload["user_id"]),
                str(payload["client_event_id"]),
            )
            if existing is None:
                raise
            return existing, False
        rows = result.data or []
        if not rows:
            raise RuntimeError("Feedback insert returned no row")
        return rows[0], True

    def pulse_rows(self, job_ids: list[str]) -> list[dict[str, Any]]:
        if not job_ids:
            return []
        jobs = (
            self.admin_db.table("jobs")
            .select(
                "job_id, first_seen, last_seen, is_active, listing_confidence, "
                "last_verified_live_at"
            )
            .in_("job_id", job_ids)
            .execute()
        ).data or []
        snapshots = (
            self.admin_db.table("job_intelligence_snapshots")
            .select(
                "job_id, tracking_count, applied_count, outcome_count, "
                "responded_count, ghosted_count, interviewed_count, offer_count, "
                "quality_report_count, looks_old_count, apply_link_closed_count, "
                "posting_inactive_count"
            )
            .in_("job_id", job_ids)
            .execute()
        ).data or []
        snapshots_by_id = {
            str(row["job_id"]): row for row in snapshots if row.get("job_id")
        }
        return [
            {
                **job,
                **snapshots_by_id.get(str(job["job_id"]), {}),
            }
            for job in jobs
            if job.get("job_id")
        ]


def get_job_intelligence_repository(
    admin_db: Client = Depends(get_supabase_admin),
    user_db: Client = Depends(get_user_db),
) -> JobIntelligenceRepository:
    return JobIntelligenceRepository(admin_db=admin_db, user_db=user_db)
