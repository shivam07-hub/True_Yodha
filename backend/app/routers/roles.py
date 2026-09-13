"""Authenticated role-family and role-scoped location discovery."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.role_families import RoleFamiliesRepository
from app.services.job_eligibility import CareerBand

router = APIRouter(prefix="/roles", tags=["roles"])


class RoleFamily(BaseModel):
    """A cluster of live jobs, named by what it hires for.

    `family` is the identity — the L2 skill cluster the matcher scopes on, and
    the direction the person is actually choosing. `label` is the cluster's most
    common job title, kept as an example only: it is not unique (twenty families
    share "Custom Software Engineer") and it cannot name the thing.

    `top_skills` is what the cluster hires for; `matched_skills` is what this
    caller already has, in the same sense the job feed uses the word. The gap
    between the two is the answer Direction exists to give.
    """

    family: str
    label: str
    open_count: int
    matched_skill_count: int
    top_skills: list[str] = []
    matched_skills: list[str] = []
    # A residual taxonomy bucket ("General Finance", "Business Operations").
    # Offerable and searchable — they hold 23% of live jobs — but never proposed
    # unprompted, because Myro cannot defend one as somebody's direction.
    is_catch_all: bool = False
    # Which Career Bands this direction belongs to. The search box is never
    # band-scoped, so a family found there can sit outside the caller's chosen
    # fields — and the client widens the fields rather than refusing the pick.
    bands: list[CareerBand] = []


class CareerBandOption(BaseModel):
    """One of the four Career Bands, as the band step has to show it.

    `job_count` is live work in the band; `family_count` is how many directions
    the band actually holds under the >= 25% rule — the SAME rule that scopes the
    suggestions on the next screen. They are two different facts and the step
    needs both: Design & Creative is 234 jobs across 8 directions where
    Engineering & Data is 17,960 across 235, and a card showing only one of those
    numbers offers them as equals.

    `fit` orders the cards and is never rendered. A band is not a score.
    """

    band: CareerBand
    job_count: int
    family_count: int
    fit: float


class RoleLocation(BaseModel):
    location: str
    open_count: int
    is_remote: bool


@router.get("/bands", response_model=list[CareerBandOption])
def list_bands(principal: Principal = Depends(get_principal)) -> list[dict[str, object]]:
    """The four Career Bands, best fit first — the Direction journey's first step.

    Asked rather than derived: a band read off the CV matches the person's own
    choice only 62.4% of the time (BACKLOG #46). Both numbers are snapshot reads;
    the live equivalent is a 7-second scan.
    """
    return RoleFamiliesRepository(get_supabase_admin()).list_bands(principal.id)


@router.get("/families", response_model=list[RoleFamily])
def list_families(
    query: str | None = Query(default=None, min_length=2, max_length=120),
    # Repeated `band` params, not a comma list: a band is a closed vocabulary of
    # four and each value round-trips as itself. Applied only when there is no
    # `query` — the RPC ignores it on the search branch, and this signature says
    # so rather than leaving the reader to find out from the SQL.
    band: list[CareerBand] | None = Query(default=None, max_length=4),
    principal: Principal = Depends(get_principal),
) -> list[dict[str, object]]:
    """Top evidenced families, or search results when ``query`` is given."""
    return RoleFamiliesRepository(get_supabase_admin()).list_families(
        principal.id, query=query, limit=20 if query else 6, bands=band
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
