"""Skill demand by city + window — the honest successor to `top_skills`.

Public (no token, no CV): the answer is identical for every viewer, which is the
point — it is the market, not a personalisation. Reads a precomputed snapshot,
so both routes are index lookups safe to mount on a rail.
"""

import logging

from fastapi import APIRouter, Depends, Query

from app.database import get_supabase_admin
from app.repositories.skill_demand import DEFAULT_SKILL_LIMIT, SkillDemandRepository
from app.schemas.skill_demand import (
    SkillDemandCitiesResponse,
    SkillDemandResponse,
    SkillDemandWindow,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def get_skill_demand_repository() -> SkillDemandRepository:
    # Public reference data, no JWT — admin client, same pattern as /jobs/analytics.
    return SkillDemandRepository(get_supabase_admin())


@router.get("/skill-demand/cities", response_model=SkillDemandCitiesResponse)
def skill_demand_cities(
    repo: SkillDemandRepository = Depends(get_skill_demand_repository),
) -> SkillDemandCitiesResponse:
    """Cities with enough live listings to say anything true about them.

    Derived, not configured: the refresh applies a live-role floor, so a city
    appears here only once its numbers mean something and disappears if its
    listings die off.
    """
    return repo.list_cities()


@router.get("/skill-demand", response_model=SkillDemandResponse)
def skill_demand(
    city: str = Query(..., min_length=1, max_length=120),
    window: SkillDemandWindow = "30d",
    limit: int = Query(DEFAULT_SKILL_LIMIT, ge=1, le=12),
    repo: SkillDemandRepository = Depends(get_skill_demand_repository),
) -> SkillDemandResponse:
    """Top skills hiring in `city`, over `window` (30d | all).

    Every row is live listings only, needs at least 3 distinct employers, and
    excludes skills where one employer holds more than 70% of the demand — the
    guards that stop a single company's bulk template reading as a market trend.
    An unknown city returns an empty list, not a 404: the picker is derived from
    the same snapshot, so a miss means the city aged out between two reads.
    """
    return repo.get_demand(city=city.strip(), window=window, limit=limit)
