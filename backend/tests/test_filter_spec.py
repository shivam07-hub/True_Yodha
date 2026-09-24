"""Consolidation C — the canonical FilterSpec + JobQuery resolver.

Guards that every producer (NL parse / intent diff / memory) maps into one spec,
and that the resolver delegates to the tuned repo methods with EXACTLY the kwargs
the old inline call sites used (behaviour-identical).
"""
from __future__ import annotations

from typing import Any

from app.services.matching.filter_spec import FilterSpec
from app.services.matching.job_query import JobQuery


# ── producers ────────────────────────────────────────────────────────────────

def test_from_nl_parse_maps_to_public_kwargs() -> None:
    parsed = {
        "role": "product manager",
        "location_city": "Bangalore",
        "location_country": "India",
        "location_mode": "hybrid",
        "skills": ["SQL", "Figma"],
    }
    spec = FilterSpec.from_nl_parse(parsed)
    assert spec.roles == ("product manager",)
    assert spec.skills == ("SQL", "Figma")
    assert spec.public_kwargs() == {
        "role": "product manager",
        "location_city": "Bangalore",
        "location_country": "India",
        "location_mode": "hybrid",
        "limit": 12,
    }


def test_from_nl_parse_empty_role_yields_blank() -> None:
    # parse_job_query never returns an empty role in practice, but the mapper must
    # degrade to role="" (→ repo returns no rows) rather than crash.
    spec = FilterSpec.from_nl_parse({"role": "  ", "skills": None})
    assert spec.roles == ()
    assert spec.public_kwargs()["role"] == ""


def test_from_intent_diff_reads_work_mode_and_locations() -> None:
    diff = {
        "add_roles": ["Data Scientist"],
        "remove_roles": ["Analyst"],
        "locations": ["Remote", "Pune"],
        "seniority": "senior",
        "work_mode": "remote",
        "salary": "25 LPA+",
    }
    spec = FilterSpec.from_intent_diff(diff)
    assert spec.roles == ("Data Scientist",)
    assert spec.seniority == "senior"
    assert spec.location_mode == "remote"       # work_mode → location_mode
    assert spec.location_city == "Remote"        # first location as the primary city hint
    assert spec.location_prefs == ("Remote", "Pune")
    assert spec.salary == "25 LPA+"


def test_from_intent_diff_rejects_bad_mode() -> None:
    spec = FilterSpec.from_intent_diff({"work_mode": "moon", "add_roles": ["PM"]})
    assert spec.location_mode is None


def test_from_memory_last_writer_wins_per_axis() -> None:
    facts = [
        {"kind": "work_mode", "text": "onsite"},
        {"kind": "work_mode", "text": "remote"},        # newer wins
        {"kind": "salary", "text": "30 LPA"},
        {"kind": "target_company", "text": "Stripe"},
        {"kind": "aspiration", "text": "Staff Engineer"},
        {"kind": "habit", "text": "codes at night"},       # free-form → ignored as a filter
    ]
    spec = FilterSpec.from_memory(facts)
    assert spec.location_mode == "remote"
    assert spec.salary == "30 LPA"
    assert spec.company == "Stripe"
    assert spec.roles == ("Staff Engineer",)


# ── consumers / resolver ──────────────────────────────────────────────────────

def test_a_spec_has_no_feed_mapper_to_map() -> None:
    """The authed /market list is not a filtered search: `shortlist_jobs` asks
    `candidates_for_user` for one person's forty jobs, and location, level,
    direction and the draining queue are all decided in SQL. A `feed_kwargs`
    growing back would mean a filter set had grown back with it."""
    assert not hasattr(FilterSpec(), "feed_kwargs")
    for gone in ("sort", "min_skill_matches", "following_only", "include_stretch"):
        assert not hasattr(FilterSpec(), gone), f"{gone} outlived the feed that read it"


class _CaptureRepo:
    def __init__(self) -> None:
        self.calls: dict[str, Any] = {}

    def public_job_query(self, **kw: Any) -> dict[str, Any]:
        self.calls["public"] = kw
        return {"rows": [], "total": 0, "relaxed": []}

    def search_jobs_by_filters(self, **kw: Any) -> dict[str, Any]:
        self.calls["drill"] = kw
        return {"rows": []}


def test_jobquery_public_delegates() -> None:
    repo = _CaptureRepo()
    JobQuery.public(repo, FilterSpec.from_nl_parse({"role": "pm"}))
    assert repo.calls["public"]["role"] == "pm"
    assert repo.calls["public"]["limit"] == 12


def test_jobquery_company_drill_delegates() -> None:
    repo = _CaptureRepo()
    spec = FilterSpec(company="Acme", skill_facet="sql", role_domain="data", page=1, page_size=50)
    JobQuery.company_drill(repo, spec)
    drill = repo.calls["drill"]
    assert drill["company"] == "Acme"
    assert drill["skill"] == "sql"
    assert drill["role_domain"] == "data"
    assert drill["page_size"] == 50
