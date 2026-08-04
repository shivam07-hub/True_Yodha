"""Multi-location preference logic (fixed-from-settings geo scope).

Pure-function coverage for the three seams that drive the feature:
- derive_location_columns: canonical array → the four synced profile columns.
- build_location_scope: freeform pref labels → OR-across-chips PostgREST clause.
- _matches_location_filters: scalar + locations[] (firecrawl #6) city matching.
"""
from __future__ import annotations

import time
from typing import Any

import app.repositories.jobs as jobs_module
from app.repositories.jobs import JobsRepository
from app.repositories.users import UsersRepository
from app.repositories.jobs import _matches_location_filters, build_location_scope
from app.services.location_normalizer import derive_location_columns


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _ProfileQuery:
    def __init__(self, row: dict[str, Any]) -> None:
        self.row = row
        self.patch: dict[str, Any] | None = None
        # PostgREST shapes its answer by the terminator: `.maybe_single()` gives
        # one object, a plain select gives a list. The fake has to keep that
        # distinction or a repository that reads a list looks broken here and
        # fine in prod.
        self.single = False

    def select(self, *_args: Any, **_kwargs: Any) -> "_ProfileQuery":
        return self

    def update(self, patch: dict[str, Any]) -> "_ProfileQuery":
        self.patch = patch
        return self

    def eq(self, *_args: Any, **_kwargs: Any) -> "_ProfileQuery":
        return self

    def maybe_single(self) -> "_ProfileQuery":
        self.single = True
        return self

    def limit(self, *_args: Any, **_kwargs: Any) -> "_ProfileQuery":
        return self

    def execute(self) -> _Result:
        if self.patch is not None:
            self.row.update(self.patch)
            return _Result([self.row])
        return _Result(dict(self.row) if self.single else [dict(self.row)])


class _ProfileDB:
    def __init__(self, row: dict[str, Any]) -> None:
        self.row = row

    def table(self, name: str) -> _ProfileQuery:
        assert name == "user_profiles"
        return _ProfileQuery(self.row)


def test_profile_location_write_clears_job_feed_location_cache() -> None:
    row = {
        "target_locations": ["Bengaluru"],
        "target_location": "Bengaluru",
    }
    db = _ProfileDB(row)
    jobs_module._user_target_locations_cache["u1"] = (time.monotonic(), ["Bengaluru"])

    UsersRepository(db).update_profile("u1", {"target_locations": ["Gurugram"]})

    assert JobsRepository(db).user_target_locations("u1") == ["Gurugram"]


# ── derive_location_columns ─────────────────────────────────────────────────

def test_derive_columns_single_city():
    cols = derive_location_columns(["Bangalore"])
    assert cols["target_locations"] == ["Bangalore"]
    assert cols["target_location"] == "Bangalore"
    assert cols["target_location_country"] == "India"
    assert cols["target_location_countries"] == ["India"]


def test_derive_columns_multi_dedupes_countries():
    cols = derive_location_columns(["Bangalore", "Mumbai"])
    assert cols["target_locations"] == ["Bangalore", "Mumbai"]
    # Both Indian cities → one deduped country, element-0 projection stays first.
    assert cols["target_location_countries"] == ["India"]
    assert cols["target_location"] == "Bangalore"


def test_derive_columns_blank_and_empty():
    assert derive_location_columns([])["target_location"] is None
    cols = derive_location_columns(["  ", "Bangalore"])
    assert cols["target_locations"] == ["Bangalore"]


# ── build_location_scope ────────────────────────────────────────────────────

def test_scope_empty_is_unscoped():
    clause, sig = build_location_scope([])
    assert clause is None and sig == ()
    assert build_location_scope(None)[0] is None


def test_scope_city_chip_matches_scalar_or_array():
    # normalize_location canonicalizes "Bangalore" → "Bengaluru"; jobs normalize
    # identically, so the scope matches the stored canonical city.
    clause, sig = build_location_scope(["Bangalore"])
    assert clause is not None
    assert "location_city.eq.Bengaluru" in clause
    assert "locations.cs.{Bengaluru}" in clause  # firecrawl #6 multi-loc rows
    # remote/hybrid null-country catch-all is always appended once a scope exists
    assert "and(location_country.is.null,location_mode.in.(remote,hybrid))" in clause
    assert sig == ("city:bengaluru",)


def test_scope_country_only_chip():
    clause, sig = build_location_scope(["India (All)"])
    assert "location_country.eq.India" in clause
    assert "location_city.eq" not in clause
    assert sig == ("country:india",)


def test_scope_mixed_city_and_country_ored():
    # The grill's hard case: city-specific + country-only must both survive.
    clause, _ = build_location_scope(["Bangalore", "India (All)"])
    assert "location_city.eq.Bengaluru" in clause
    assert "location_country.eq.India" in clause


def test_scope_dedupes_repeats():
    _, sig = build_location_scope(["Bangalore", "Bangalore"])
    assert sig == ("city:bengaluru",)


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
