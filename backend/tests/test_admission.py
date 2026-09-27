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


def test_a_listing_whose_city_is_its_country_is_not_in_a_named_city() -> None:
    brussels_as_india = _job(location="India, India", location_city="India")
    assert admission.admit(_PROFILE, brussels_as_india).barred_by == "location"


def test_the_employers_stated_years_must_overlap_seven_to_nine() -> None:
    assert admission.admit(_PROFILE, _job(min_years_experience=2, max_years_experience=5)).barred_by == "level"
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
