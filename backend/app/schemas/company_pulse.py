"""Response models for the company demand-pulse endpoint (Signal Thread S2).

Kept in a dedicated module (not schemas/jobs.py) so the pulse surface owns its
own contract."""

from __future__ import annotations

from pydantic import BaseModel


class CompanyPulseItem(BaseModel):
    company_name: str
    # Live roles right now (last_seen within the freshness window).
    open_roles: int
    # New roles first seen in the last 7 days.
    weekly_delta: int
    # 0-100 demand index, or null when the company has no live roles (syncing /
    # no signal — the client renders the em-dash state, never a fabricated 0).
    pulse: int | None
    # 30-point sparkline of trailing fresh-role inflow (oldest → today).
    series: list[int]
    # ISO date the company was last seen in a crawl, or null.
    last_seen_at: str | None = None


class CompanyPulseResponse(BaseModel):
    companies: list[CompanyPulseItem]
