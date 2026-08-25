"""Durable orchestration for Tier-0 corpus refreshes.

The HTTP route only persists a request and acknowledges it. This service runs
after the response using the batch-sized Supabase client. State and leases live
in Postgres, so a Railway restart leaves visible work for the next cron retry.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

from app.database import get_supabase_admin_batch
from app.repositories.jobs import JobsRepository
from app.repositories.skill_demand import SkillDemandRepository

logger = logging.getLogger(__name__)

REFRESH_TASKS = (
    "analytics",
    "skill_demand",
    "job_search",
    "role_families",
    "company_directory",
)
STATUS_MAX_AGE = timedelta(hours=48)


class SnapshotRefreshService:
    def __init__(
        self,
        db: Client,
        *,
        analytics_refresh: Callable[[str, bool], dict[str, Any]],
        skill_refresh: Callable[[], dict[str, Any]],
        search_refresh: Callable[[], dict[str, Any]],
        role_family_refresh: Callable[[], dict[str, Any]],
        company_directory_refresh: Callable[[], dict[str, Any]],
    ) -> None:
        self._db = db
        self._analytics_refresh = analytics_refresh
        self._handlers: dict[str, Callable[[], dict[str, Any]]] = {
            "skill_demand": skill_refresh,
            "job_search": search_refresh,
            "role_families": role_family_refresh,
            "company_directory": company_directory_refresh,
        }

    def request(self, *, trigger: str, force: bool) -> list[str]:
        result = self._db.rpc(
            "request_snapshot_refresh",
            {"p_trigger": trigger, "p_force": force},
        ).execute()
        return [
            str(row["task"])
            for row in (result.data or [])
            if isinstance(row, dict) and row.get("task") in REFRESH_TASKS
        ]

    def process(self, tasks: list[str], *, trigger: str, force: bool) -> None:
        for task in REFRESH_TASKS:
            if task not in tasks or not self._claim(task, trigger):
                continue
            try:
                result = (
                    self._analytics_refresh(trigger, force)
                    if task == "analytics"
                    else self._handlers[task]()
                )
            except Exception as exc:  # noqa: BLE001 — persist failure, continue siblings
                self._finish(task, success=False, error=str(exc))
                logger.exception(
                    "metric snapshot_refresh.failed task=%s trigger=%s", task, trigger
                )
                continue
            self._finish(task, success=True, result=result)
            logger.warning(
                "metric snapshot_refresh.succeeded task=%s trigger=%s", task, trigger
            )

    def status(self) -> list[dict[str, Any]]:
        rows = (
            self._db.table("snapshot_refresh_state")
            .select(
                "task,status,requested_at,requested_by,started_at,last_success_at,"
                "last_error_at,last_error,attempts,result,updated_at"
            )
            .order("task")
            .execute()
            .data
            or []
        )
        now = datetime.now(timezone.utc)
        for row in rows:
            succeeded = _parse_datetime(row.get("last_success_at"))
            row["stale"] = succeeded is None or now - succeeded > STATUS_MAX_AGE
        return rows

    def _claim(self, task: str, trigger: str) -> bool:
        result = self._db.rpc(
            "claim_snapshot_refresh",
            {"p_task": task, "p_trigger": trigger, "p_lease_seconds": 900},
        ).execute()
        value = result.data
        if isinstance(value, list):
            value = value[0] if value else False
        return bool(value)

    def _finish(
        self,
        task: str,
        *,
        success: bool,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        self._db.rpc(
            "finish_snapshot_refresh",
            {
                "p_task": task,
                "p_success": success,
                "p_result": result or {},
                "p_error": error,
            },
        ).execute()


def build_snapshot_refresh_service() -> SnapshotRefreshService:
    db = get_supabase_admin_batch()
    jobs = JobsRepository(db=db, admin_db=db)
    skills = SkillDemandRepository(db)

    def refresh_analytics(trigger: str, force: bool) -> dict[str, Any]:
        if force:
            return jobs.persist_analytics_snapshot(refreshed_by=trigger)
        return jobs.refresh_analytics_snapshot_if_stale(refreshed_by=trigger)

    def refresh_role_families() -> dict[str, Any]:
        """The role typeahead's label taxonomy — the expensive half, once per
        ingest instead of once per keystroke (migration 20260825100000)."""
        result = db.rpc("refresh_role_family_labels", {}).execute().data
        if isinstance(result, list):
            result = result[0] if result else {}
        if not isinstance(result, dict):
            result = {}
        return {"families": int(result.get("families", 0) or 0)}

    def refresh_company_directory() -> dict[str, Any]:
        """The SEO company list. It full-scanned the jobs heap even as
        service_role — 12,654 buffers for 232 rows (migration 20260825110000)."""
        result = db.rpc("refresh_company_directory", {}).execute().data
        if isinstance(result, list):
            result = result[0] if result else {}
        if not isinstance(result, dict):
            result = {}
        return {"companies": int(result.get("companies", 0) or 0)}

    def refresh_search() -> dict[str, Any]:
        result = db.rpc("refresh_job_search_index", {}).execute().data
        if isinstance(result, list):
            result = result[0] if result else 0
        if isinstance(result, dict):
            result = result.get("rows", result.get("rows_written", 0))
        return {"rows": int(result or 0)}

    return SnapshotRefreshService(
        db,
        analytics_refresh=refresh_analytics,
        skill_refresh=skills.refresh,
        search_refresh=refresh_search,
        role_family_refresh=refresh_role_families,
        company_directory_refresh=refresh_company_directory,
    )


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
