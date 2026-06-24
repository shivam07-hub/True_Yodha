"""GET /cv/reservoir — the Master CV as a curatable experience reservoir.

Groups the user's `cv_points` into the inventory view (roles → points → phrasing
variants, canonical first). Read-only. If the user has no reservoir rows yet
(not backfilled / brand-new), it derives points live from the master via
explode_master — so the endpoint always returns a coherent inventory.

All grouping lives in services/cv_reservoir (pure, unit-tested).
Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.services import cv_reservoir, cv_rewrite

router = APIRouter()


class RVVariant(BaseModel):
    id: str
    text: str
    audience_tags: list[str] = Field(default_factory=list)
    source: str
    is_canonical: bool


class RVPoint(BaseModel):
    point_key: str
    variants: list[RVVariant]
    needs_impact: bool


class RVRole(BaseModel):
    role_id: str
    kind: str
    title: str
    org: str | None = None
    dates: str | None = None
    points: list[RVPoint]


class ReservoirView(BaseModel):
    roles: list[RVRole]
    summary: str | None = None
    skills_line: str | None = None
    certs: list[str] = Field(default_factory=list)


@router.get("/reservoir", response_model=ReservoirView)
def reservoir(
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> ReservoirView:
    user_id = principal.id

    baseline = cv_repo.latest_baseline(user_id)
    cv_structured = (baseline or {}).get("cv_structured") or {}
    if not cv_structured:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Upload a CV with structured content first to build your inventory.",
        )

    points = cv_repo.reservoir_points(user_id)
    if not points:
        # Un-backfilled / brand-new user: derive a one-variant-per-bullet view live.
        points = cv_reservoir.explode_master(cv_structured)

    view = cv_reservoir.build_reservoir_view(cv_structured, points, cv_rewrite.has_metric)
    return ReservoirView(**view)
