"""Company Demand Pulse — lookup the snapshot, never scan `jobs`."""

from __future__ import annotations

import logging
from typing import Any

from postgrest.exceptions import APIError
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_read
from app.services.company_pulse import project_item, sort_key_for

_log = logging.getLogger(__name__)


class CompanySignalsRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def pulse_for(self, companies: list[str]) -> list[dict[str, Any]]:
        """One indexed IN() on `company_pulse_snapshot`. Caller order is preserved."""
        names = [name.strip() for name in companies if name and name.strip()]
        if not names:
            return []
        keys = list(dict.fromkeys(sort_key_for(name) for name in names))
        try:
            rows = safe_read(
                self._db.table("company_pulse_snapshot")
                .select("sort_key, open_roles, weekly_delta, inflow_by_day")
                .in_("sort_key", keys),
                default=[],
                context="company_pulse_snapshot",
            )
        except APIError:
            _log.warning("metric company_pulse.snapshot_unavailable")
            return [project_item(company_name=name) for name in names]
        by_key = {
            str(row["sort_key"]): row
            for row in (rows or [])
            if isinstance(row, dict) and row.get("sort_key")
        }
        return [_item(name, by_key.get(sort_key_for(name))) for name in names]


def get_company_signals_repository() -> CompanySignalsRepository:
    return CompanySignalsRepository(get_supabase_admin())


def _item(company_name: str, row: dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        return project_item(company_name=company_name)
    return project_item(
        company_name=company_name,
        open_roles=int(row.get("open_roles") or 0),
        weekly_delta=int(row.get("weekly_delta") or 0),
        inflow_by_day=_inflow(row.get("inflow_by_day")),
    )


def _inflow(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    out: list[int] = []
    for item in value:
        try:
            out.append(int(item or 0))
        except (TypeError, ValueError):
            out.append(0)
    return out
