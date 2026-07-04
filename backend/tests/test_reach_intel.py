"""Reach Intelligence — deterministic, ADR-0018-clean search derivation.

Fixture uses the real JD Shivam surfaced (Netscribes Manager - Presales, which
literally prints "Reporting to : VP") so the reporting-line extractor is pinned
to a real-world shape.
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from app.services.reach_intel import (
    build_reach_intel,
    build_target_titles,
    derive_function,
    extract_reporting_target,
)

NETSCRIBES_JD = """Work Model - Hybrid Office Model
Role : Presales Data Analytics & Data Engineering
Designation : Manager
LOB : Data Analytics
Reporting to : VP
Key Responsibilities:
- Engage with clients and guide them on their data journey.
"""


def test_extract_reporting_target_from_real_jd():
    assert extract_reporting_target(NETSCRIBES_JD) == "VP"


def test_extract_reporting_target_variants():
    assert extract_reporting_target("Reports to the Director of Sales") == "Director"
    assert extract_reporting_target("This role reports into Head of Growth") == "Head"
    assert extract_reporting_target("Reporting to: Senior Vice President") == "Senior Vice President"
    assert extract_reporting_target("You will work with the team") is None
    assert extract_reporting_target("") is None


def test_derive_function_strips_seniority_and_noise():
    fn = derive_function(
        "Netscribes - Manager - Presales - Data Analytics & Data Engineering",
        company="Netscribes",
    )
    lower = fn.lower()
    # Functional words survive.
    assert "presales" in lower
    assert "data" in lower
    assert "analytics" in lower
    # Seniority + company name are gone (company stripped so it is not doubled
    # when appended as a search keyword).
    assert "manager" not in lower
    assert "netscribes" not in lower


def test_derive_function_drops_location_and_employment_noise():
    fn = derive_function("Senior Marketing Manager - Full Time - Pune").lower()
    assert "marketing" in fn
    assert "senior" not in fn
    assert "manager" not in fn
    assert "pune" not in fn
    assert "full" not in fn and "time" not in fn


def test_target_titles_lead_with_reporting_target():
    titles = build_target_titles("VP", "Presales Data Analytics")
    assert titles[0] == "VP Presales Data Analytics"
    # The bare function is included so the search surfaces the whole team.
    assert "Presales Data Analytics" in titles
    assert any(t.startswith("Head of") for t in titles)


def test_target_titles_without_reporting_target():
    titles = build_target_titles(None, "Marketing")
    assert titles  # still produces leader-title ladder over the function
    assert any("Marketing" in t for t in titles)
    assert all(t for t in titles)


def test_build_reach_intel_end_to_end_netscribes():
    intel = build_reach_intel(
        job_title="Netscribes - Manager - Presales - Data Analytics & Data Engineering",
        job_description=NETSCRIBES_JD,
        company="Netscribes",
    )
    assert intel.reporting_target == "VP"
    assert intel.primary is not None
    # Primary opens a LinkedIn people search that includes the company.
    assert intel.primary.kind == "linkedin"
    assert "linkedin.com/search/results/people" in intel.primary.url
    q = parse_qs(urlparse(intel.primary.url).query)["keywords"][0]
    assert "Netscribes" in q
    assert "VP" in q
    # A Google→LinkedIn alternate exists (query is URL-encoded).
    def _google_q(url: str) -> str:
        return parse_qs(urlparse(url).query).get("q", [""])[0]

    assert any(
        a.kind == "google" and "site:linkedin.com/in" in _google_q(a.url)
        for a in intel.alternates
    )
    # No result is ever fetched — this is pure URL construction (no network in
    # the call path is the invariant; asserted structurally by there being no
    # http client import in the service).


def test_company_only_fallback_when_title_empty():
    intel = build_reach_intel(job_title="", job_description="", company="Acme")
    assert intel.primary is not None
    assert "Acme" in parse_qs(urlparse(intel.primary.url).query)["keywords"][0]


def test_empty_everything_yields_no_search():
    intel = build_reach_intel(job_title="", job_description="", company=None)
    assert intel.primary is None
    assert intel.alternates == []
