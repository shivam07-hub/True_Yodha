"""Skill demand by location + window.

Own module rather than an addition to `schemas/jobs.py`: this reads a
precomputed snapshot, not the live jobs scan the rest of that file models, and
the two must not drift into looking interchangeable.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

SkillDemandWindow = Literal["30d", "all"]


class SkillDemandItem(BaseModel):
    skill: str
    roles: int
    # Distinct employers. Shipped alongside `roles` because a role count without
    # it cannot distinguish a broad market from one company's bulk posting —
    # which is exactly how the old movers rail read 321 roles off 8 live ones.
    companies: int


class SkillDemandCity(BaseModel):
    city: str
    live_roles: int


class SkillDemandResponse(BaseModel):
    city: str
    window: SkillDemandWindow
    skills: list[SkillDemandItem]
    # When the snapshot was computed, not when it was read. The client shows this
    # so a stale corpus is legible instead of passing as "now".
    computed_at: datetime | None = None


class SkillDemandCitiesResponse(BaseModel):
    cities: list[SkillDemandCity]
    computed_at: datetime | None = None
