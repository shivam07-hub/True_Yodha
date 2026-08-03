"""Family names carry slashes, so they cannot live in a path segment.

"Artificial Intelligence and Machine Learning (AI/ML)" is a real corpus family.
Encoded as %2F it still 404'd, because uvicorn unquotes the path before
Starlette routes it — the segment split and matched no route, so every AI/ML
user reached step 2 of onboarding with an empty location picker.
"""

from __future__ import annotations

from urllib.parse import parse_qs, quote, unquote, urlsplit

SLASHED_FAMILY = "Artificial Intelligence and Machine Learning (AI/ML)"
# What the frontend sends: encodeURIComponent == quote(safe="").
ENCODED = quote(SLASHED_FAMILY, safe="")


def test_family_survives_the_path_unquoting_that_broke_the_old_route() -> None:
    """Routing splits the PATH. Keeping the family out of it is the whole fix."""
    new = urlsplit(f"/roles/family-locations?family={ENCODED}")
    # The path uvicorn hands Starlette is intact — two segments, route matches.
    assert unquote(new.path) == "/roles/family-locations"
    # And the value comes back verbatim, slash and all.
    assert parse_qs(new.query)["family"] == [SLASHED_FAMILY]

    # The old shape, for contrast: uvicorn unquotes before routing, so %2F turns
    # back into a separator and the single {family} segment is torn in two.
    old_path = unquote(f"/roles/families/{ENCODED}/locations")
    assert old_path.split("/")[1:] != ["roles", "families", SLASHED_FAMILY, "locations"]


def test_route_is_registered_without_a_family_path_segment() -> None:
    from app.routers.roles import router

    paths = {route.path for route in router.routes}  # type: ignore[attr-defined]
    assert "/roles/family-locations" in paths
    assert not any("{family}" in path for path in paths)
