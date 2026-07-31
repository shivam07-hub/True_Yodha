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


@router.get("/families/{family}/locations", response_model=list[RoleLocation])
def list_locations(
    family: str,
    query: str | None = Query(default=None, min_length=2, max_length=120),
    principal: Principal = Depends(get_principal),
) -> list[dict[str, object]]:
    # Authentication makes corpus search attributable; the data remains sourced
    # solely from verifier-active jobs, never user input.
    del principal
    return RoleFamiliesRepository(get_supabase_admin()).list_locations(family, query=query)
