"""The two caps on a career target, held equal everywhere they are enforced.

`career_target.MAX_TARGET_LOCATIONS` and `MAX_TARGET_ROLES` are the definition.
Everything else — the request model, the save path, Myro Search's slot, Job
Tracks, and the TypeScript the Direction step and Settings read — must agree,
because the stricter one silently wins. `eec3075e` moved cities to 5 and left
the request model at 3: every fourth city was a 422 that read "Request
validation failed.", and one user retried Direction fourteen times.

A scalar is a complete contract, so equality is the whole test — unlike a
mirrored *behaviour*, which is why Myro Search stopped mirroring its slot
filing and this file does not stop anyone mirroring a number.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.routers.onboarding import TargetRequest
from app.services.career_target import MAX_TARGET_LOCATIONS, MAX_TARGET_ROLES
from app.services.preflight.spec import SLOT_ARITY

ROOT = Path(__file__).resolve().parents[2]
CAREER_TARGET_TS = ROOT / "frontend" / "lib" / "career-target.ts"


def _ts_constant(name: str) -> int:
    source = CAREER_TARGET_TS.read_text(encoding="utf-8")
    match = re.search(rf"export const {name}\s*=\s*(\d+)\b", source)
    if match is None:
        raise AssertionError(f"{name} is not declared in {CAREER_TARGET_TS.name}")
    return int(match.group(1))


def test_the_frontend_states_the_same_caps() -> None:
    assert _ts_constant("MAX_TARGET_LOCATIONS") == MAX_TARGET_LOCATIONS
    assert _ts_constant("MAX_TARGET_ROLES") == MAX_TARGET_ROLES


def test_myro_search_slots_hold_as_many_as_the_profile() -> None:
    """A narrower slot would drop roles the next time Search runs."""
    assert SLOT_ARITY["target_locations"] == MAX_TARGET_LOCATIONS
    assert SLOT_ARITY["target_role_titles"] == MAX_TARGET_ROLES


def _target(*, roles: int, cities: int) -> TargetRequest:
    names = [f"Family {n}" for n in range(roles)]
    return TargetRequest(
        role_titles=names,
        role_families=names,
        locations=[f"City {n}" for n in range(cities)],
    )


def test_the_request_takes_everything_the_screen_can_send() -> None:
    body = _target(roles=MAX_TARGET_ROLES, cities=MAX_TARGET_LOCATIONS)
    assert len(body.role_titles or []) == MAX_TARGET_ROLES
    assert len(body.locations or []) == MAX_TARGET_LOCATIONS


@pytest.mark.parametrize(
    ("roles", "cities"),
    [(MAX_TARGET_ROLES + 1, 1), (1, MAX_TARGET_LOCATIONS + 1)],
)
def test_the_request_still_bounds_both_lists(roles: int, cities: int) -> None:
    with pytest.raises(ValidationError):
        _target(roles=roles, cities=cities)
