"""Reads for the skill-demand panel, plus the refresh trigger.

The panel answers "which skills is this city actually hiring for" — the honest
version of the old `/jobs/analytics` `top_skills` movers, which counted every
row in `jobs` regardless of whether the listing was still open.

Reads here are deliberately thin: all the work (liveness, employer spread,
employer dominance, taxonomy allowlist) happens in
`refresh_skill_demand_snapshot()` and lands in `skill_demand_snapshot`. Measured
on prod 2026-07-21 — the equivalent live query is 2.07s for Bengaluru, the
snapshot read is 0.84ms. Reads must never fall back to computing it live; a
missing snapshot is an empty panel plus a metric, not a slow one.
"""

from __future__ import annotations

import logging
from typing import Any

from postgrest.exceptions import APIError
from supabase import Client

from app.schemas.skill_demand import (
    SkillDemandCitiesResponse,
    SkillDemandCity,
    SkillDemandItem,
    SkillDemandResponse,
    SkillDemandWindow,
)

logger = logging.getLogger(__name__)

DEFAULT_SKILL_LIMIT = 8


class SkillDemandRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def get_demand(
        self,
        city: str,
        window: SkillDemandWindow = "30d",
        limit: int = DEFAULT_SKILL_LIMIT,
    ) -> SkillDemandResponse:
        rows = self._select(
            self._db.table("skill_demand_snapshot")
            .select("skill_id, display_name, roles, companies, rank, computed_at")
            .eq("location_city", city)
            .eq("window_key", window)
            .order("rank")
            .limit(max(1, min(limit, 12)))
        )
        return SkillDemandResponse(
            city=city,
            window=window,
            skills=[
                SkillDemandItem(
                    skill=row["display_name"],
                    roles=int(row.get("roles") or 0),
                    companies=int(row.get("companies") or 0),
                )
                for row in rows
            ],
            computed_at=rows[0].get("computed_at") if rows else None,
        )

    def list_cities(self) -> SkillDemandCitiesResponse:
        rows = self._select(
            self._db.table("skill_demand_city")
            .select("location_city, live_roles, computed_at")
            .order("live_roles", desc=True)
        )
        return SkillDemandCitiesResponse(
            cities=[
                SkillDemandCity(
                    city=row["location_city"],
                    live_roles=int(row.get("live_roles") or 0),
                )
                for row in rows
            ],
            computed_at=rows[0].get("computed_at") if rows else None,
        )

    def refresh(self) -> dict[str, int]:
        """Recompute the snapshot. ~9s on the current corpus — background callers
        only (scrape finalisation, verifier sweep). Never call from a request path.
        """
        result = self._db.rpc("refresh_skill_demand_snapshot", {}).execute()
        rows = result.data or []
        row = rows[0] if isinstance(rows, list) and rows else {}
        return {
            "cities": int(row.get("cities") or 0),
            "rows_written": int(row.get("rows_written") or 0),
        }

    def _select(self, query: Any) -> list[dict[str, Any]]:
        """Read the snapshot, degrading to empty rather than raising.

        The panel is one widget on a page full of others. A snapshot table that
        is missing or mid-refresh must cost that widget, not the page — but it is
        logged, because a permanently empty panel that nobody is told about is
        the failure mode this whole rewrite exists to fix.
        """
        try:
            return query.execute().data or []
        except APIError as exc:
            logger.warning("metric skill_demand.read_failed error=%s", exc)
            return []
