"""Authenticated role-family and role-scoped location discovery."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.role_families import RoleFamiliesRepository

router = APIRouter(prefix="/roles", tags=["roles"])


class RoleFamily(BaseModel):
    family: str
    label: str
    open_count: int
    matched_skill_count: int


class RoleLocation(BaseModel):
    location: str
    open_count: int
    is_remote: bool


@router.get("/families", response_model=list[RoleFamily])
def list_families(
    query: str | None = Query(default=None, min_length=2, max_length=120),
    principal: Principal = Depends(get_principal),
) -> list[dict[str, object]]:
    """Top three evidenced families, or search results when ``query`` is given."""
    return RoleFamiliesRepository(get_supabase_admin()).list_families(
        principal.id, query=query, limit=20 if query else 3
    )


@router.get("/family-locations", response_model=list[RoleLocation])
def list_locations(
    family: str = Query(min_length=1, max_length=200),
    query: str | None = Query(default=None, min_length=2, max_length=120),
    principal: Principal = Depends(get_principal),
) -> list[dict[str, object]]:
    # `family` is a QUERY parameter, not a path segment, because corpus family
    # names contain slashes — "Artificial Intelligence and Machine Learning
    # (AI/ML)" is a real one. A client encodes that to %2F, but uvicorn unquotes
    # the path before Starlette routes it, so the segment split back into
    # .../(AI/ML)/locations and matched nothing: every AI/ML user got a 404 and
    # an empty location picker. A query value survives the same round-trip.
    # Authentication makes corpus search attributable; the data remains sourced
    # solely from verifier-active jobs, never user input.
    del principal
    return RoleFamiliesRepository(get_supabase_admin()).list_locations(family, query=query)
