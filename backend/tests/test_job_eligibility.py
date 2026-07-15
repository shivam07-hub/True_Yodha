"""Career Band + seniority boundary tests.

The gates are intentionally pure: feed and Career Ops use the same decision
without allowing an LLM, client filter, or unavailable source field to widen it.
"""
from __future__ import annotations

from app.services.job_eligibility import (
    career_band_for_job,
    career_band_for_profile,
    job_is_eligible,
)


def test_product_designer_uses_design_band_over_product_domain() -> None:
    assert career_band_for_job({
        "job_title": "Product Designer",
        "role_domain": "Product Management",
    }) == "design_creative"


def test_policy_researcher_maps_to_research_people_public_impact() -> None:
    assert career_band_for_job({
        "job_title": "Policy Research Associate",
        "role_domain": "Research & Science",
    }) == "research_people_public_impact"


def test_profile_band_derives_from_target_role_titles() -> None:
    assert career_band_for_profile({
        "target_role_titles": ["Public Policy Research Associate"],
    }) == "research_people_public_impact"


def test_entry_level_ma_never_receives_vp_or_business_role() -> None:
    profile = {
        "target_career_band": "research_people_public_impact",
        "target_seniority": "entry",
    }
    assert not job_is_eligible(profile, {
        "job_title": "Vice President, Corporate Strategy",
        "role_domain": "Strategy & Consulting",
        "seniority_level": "executive",
        "min_years_experience": 10,
    })


def test_entry_level_ma_receives_entry_policy_research_role() -> None:
    profile = {
        "target_career_band": "research_people_public_impact",
        "target_seniority": "entry",
    }
    assert job_is_eligible(profile, {
        "job_title": "Graduate Policy Research Associate",
        "role_domain": "Research & Science",
        "seniority_level": "entry",
        "min_years_experience": 0,
    })


def test_cross_band_is_only_admitted_after_explicit_exploration() -> None:
    profile = {
        "target_career_band": "research_people_public_impact",
        "explored_career_bands": ["business_product_operations"],
        "target_seniority": "entry",
    }
    business_job = {
        "job_title": "Graduate Business Analyst",
        "role_domain": "Strategy & Consulting",
        "seniority_level": "entry",
    }
    assert job_is_eligible(profile, business_job)


def test_second_target_role_is_an_explicit_cross_band_request() -> None:
    profile = {
        "target_role_titles": ["Policy Research Associate", "Product Manager"],
        "target_seniority": "entry",
    }
    assert job_is_eligible(profile, {
        "job_title": "Graduate Product Analyst",
        "role_domain": "Product Management",
        "seniority_level": "entry",
    })


def test_entry_stretch_can_admit_mid_but_never_senior_or_executive() -> None:
    profile = {
        "target_career_band": "research_people_public_impact",
        "target_seniority": "entry",
    }
    mid = {
        "job_title": "Policy Researcher",
        "role_domain": "Research & Science",
        "seniority_level": "mid",
        "min_years_experience": 3,
    }
    senior = {
        "job_title": "Senior Policy Researcher",
        "role_domain": "Research & Science",
        "seniority_level": "senior",
        "min_years_experience": 5,
    }
    assert not job_is_eligible(profile, mid)
    assert job_is_eligible(profile, mid, include_stretch=True)
    assert not job_is_eligible(profile, senior, include_stretch=True)


def test_legacy_any_seniority_is_treated_as_entry_level() -> None:
    profile = {
        "target_career_band": "research_people_public_impact",
        "target_seniority": "any",
    }
    executive = {
        "job_title": "Vice President, Public Policy",
        "role_domain": "Research & Science",
        "seniority_level": "executive",
    }
    assert not job_is_eligible(profile, executive)
