"""Admission: one answer to "may this person be shown this judged job, today".

Cases are the ones a real /market list held on 2026-09-28: 24 of 56 cards
outside the person's cities, six retired listings, and a Brussels requisition
the scraper had tagged "India".
"""
from __future__ import annotations

from typing import Any

from app.services.matching import admission

_PROFILE: dict[str, Any] = {
    "target_locations": ["Bengaluru", "Hyderabad", "Gurugram", "Mumbai"],
    "target_location_countries": ["India"],
    "target_seniority": "senior",
    "years_experience": 8,
}


def _job(**over: Any) -> dict[str, Any]:
    base = {
        "is_active": True,
        "location": "Bengaluru, India",
        "location_city": "Bengaluru",
        "location_country": "India",
        "min_years_experience": None,
        "max_years_experience": None,
        "seniority_level": None,
    }
    base.update(over)
    return base


def test_a_job_in_a_named_city_at_level_is_admitted() -> None:
    assert admission.admit(_PROFILE, _job()).admitted


def test_a_retired_listing_is_barred_and_an_unknown_one_is_not() -> None:
    assert admission.admit(_PROFILE, _job(is_active=False)).barred_by == "closed"
    # Absent is not closed.
    assert admission.admit(_PROFILE, _job(is_active=None)).admitted


def test_a_city_the_person_did_not_name_is_barred() -> None:
    chennai = _job(location="Chennai, India", location_city="Chennai")
    assert admission.admit(_PROFILE, chennai).barred_by == "location"


def test_a_listing_naming_only_its_country_is_shown() -> None:
    # CEO decision 2026-10-04 (Q1): a job with no city is open to everyone in its
    # country, labeled "India — city not specified". A row written before the
    # release still says city "India"; it reads the same way.
    labeled = _job(location="India — city not specified", location_city=None)
    legacy = _job(location="India, India", location_city="India")
    assert admission.admit(_PROFILE, labeled).admitted
    assert admission.admit(_PROFILE, legacy).admitted


def test_a_listing_in_a_city_abroad_is_barred() -> None:
    # The Brussels requisition once tagged "India" now carries its real city.
    brussels = _job(location="Brussels", location_city="Brussels", location_country=None)
    assert admission.admit(_PROFILE, brussels).barred_by == "location"


def test_the_employers_minimum_must_be_within_nine_years() -> None:
    # Eight years spans 7-9. A role asking fewer is admitted; over-qualification
    # is the brain's call, not the gate's.
    assert admission.admit(_PROFILE, _job(min_years_experience=2, max_years_experience=5)).admitted
    assert admission.admit(_PROFILE, _job(min_years_experience=5, max_years_experience=8)).admitted
    # "3+ years" states no ceiling, so it reaches eight.
    assert admission.admit(_PROFILE, _job(min_years_experience=3)).admitted
    assert admission.admit(_PROFILE, _job(min_years_experience=15)).barred_by == "level"


def test_admitted_reads_the_jobs_embed_of_each_row() -> None:
    rows = [
        {"job_id": "keep", "jobs": _job()},
        {"job_id": "closed", "jobs": _job(is_active=False)},
        {"job_id": "pune", "jobs": _job(location="Pune, India", location_city="Pune")},
    ]
    assert [r["job_id"] for r in admission.admitted(_PROFILE, rows)] == ["keep"]
