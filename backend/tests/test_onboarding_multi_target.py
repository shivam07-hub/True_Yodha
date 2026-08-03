"""Targeting is plural on both axes — roles AND locations.

`target_locations` has been an array end-to-end for a while (the feed's
`build_location_scope` ORs across cities), but `save_target` accepted a single
`location` and overwrote the array with a one-element list, so the picker could
only ever express one city. These cover the widened write path and the one
distinction that is easy to get wrong: `[]` (Anywhere) vs omitted (leave alone).
"""

from __future__ import annotations

from app.services.onboarding_service import (
    _normalize_families,
    _normalize_locations,
    role_title_updates,
)


def test_locations_dedupe_preserve_order_and_cap_at_five() -> None:
    assert _normalize_locations(None, ["Pune", " Pune ", "Bengaluru"]) == ["Pune", "Bengaluru"]
    assert _normalize_locations(None, [f"City{i}" for i in range(9)]) == [
        f"City{i}" for i in range(5)
    ]


def test_singular_location_folds_into_the_list() -> None:
    assert _normalize_locations(" Bengaluru ", None) == ["Bengaluru"]


def test_empty_list_is_anywhere_not_absence() -> None:
    """`[]` means the user cleared every city; it must not fall back to singular."""
    assert _normalize_locations("Bengaluru", []) == []


def test_families_are_plural_and_deduped() -> None:
    updates = role_title_updates(
        ["Data Engineer", "Solution Architect"],
        role_families=["Data Science", "Data Science", "Cloud"],
    )
    assert updates["target_roles"] == ["Data Science", "Cloud"]
    assert updates["target_role_titles"] == ["Data Engineer", "Solution Architect"]
    # Primary stays titles[0] — the score label and every back-compat read.
    assert updates["target_role_title"] == "Data Engineer"


def test_singular_family_still_works() -> None:
    assert role_title_updates(["Data Engineer"], role_family="Data Science")["target_roles"] == [
        "Data Science"
    ]
    assert _normalize_families("Cloud", None) == ["Cloud"]
