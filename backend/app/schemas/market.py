"""Market answers with no person in them (`/partner/v1/market/*`, scope `market.read`)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

WorkMode = Literal["remote", "hybrid", "onsite"]


class MarketJob(BaseModel):
    job_id: str
    title: str
    company: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    work_mode: str | None = None
    # The day the crawler discovered it. `jobs.first_seen` stores a YYYYMMDD
    # marker; `listing_time.day` is the only conversion.
    first_seen: date | None = None


class MarketJobsResponse(BaseModel):
    jobs: list[MarketJob]
    total: int
    # Filters dropped to reach real roles, e.g. ["location"]. Empty = strict.
    relaxed: list[str]


class RoleFamilySkills(BaseModel):
    family: str
    open_roles: int
    core_skills: list[str]


class RoleSkillsResponse(BaseModel):
    role: str
    families: list[RoleFamilySkills]
    refreshed_at: datetime | None = None
