"""Multi-location preference logic (fixed-from-settings geo scope).

Pure-function coverage for the two seams that drive the feature:
- derive_location_columns: canonical array → the two profile columns.
- _matches_location_filters: scalar + locations[] (firecrawl #6) city matching.
"""
from __future__ import annotations

from app.repositories.jobs import _matches_location_filters
from app.services.location_normalizer import derive_location_columns


# ── derive_location_columns ─────────────────────────────────────────────────

def test_derive_columns_single_city():
    cols = derive_location_columns(["Bangalore"])
    assert cols["target_locations"] == ["Bangalore"]
    assert cols["target_location_countries"] == ["India"]


def test_derive_columns_multi_dedupes_countries():
    cols = derive_location_columns(["Bangalore", "Mumbai"])
    assert cols["target_locations"] == ["Bangalore", "Mumbai"]
    # Both Indian cities → one deduped country.
    assert cols["target_location_countries"] == ["India"]


def test_derive_columns_blank_and_empty():
    assert derive_location_columns([]) == {"target_locations": [], "target_location_countries": []}
    cols = derive_location_columns(["  ", "Bangalore"])
    assert cols["target_locations"] == ["Bangalore"]


# ── _matches_location_filters (locations[] coverage) ────────────────────────

def test_match_city_via_scalar():
    row = {"location_city": "Bangalore", "location_country": "India", "locations": []}
    assert _matches_location_filters(row, location_city="Bangalore", location_country=None, location_mode=None)


def test_match_city_via_locations_array_when_scalar_null():
    # Multi-loc row: scalar city nulled, real city only in locations[].
    row = {"location_city": None, "location_country": "India", "locations": ["Bangalore", "Mumbai"]}
    assert _matches_location_filters(row, location_city="Mumbai", location_country=None, location_mode=None)


def test_match_city_miss():
    row = {"location_city": "Delhi", "location_country": "India", "locations": ["Delhi"]}
    assert not _matches_location_filters(row, location_city="Bangalore", location_country=None, location_mode=None)
