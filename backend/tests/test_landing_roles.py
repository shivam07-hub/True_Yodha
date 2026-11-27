"""Spec #66 L1, L2b — the landing's roles, open jobs and skills per band.

Two halves: the pure compile that runs inside the market snapshot write, and
`GET /public/landing-roles` + `GET /public/landing-role`, which only slice that
snapshot: the chips in full, every other family by name for the search, and a
searched family in full on its own read.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import public as public_router
from app.services import shared_cache
from app.services.background import debounce
from app.services.landing_roles import (
    BAND_MIN_JOBS,
    BANDS,
    ROLES_SHOWN,
    LandingCuration,
    compile_landing_roles,
    offer,
)

NONE = LandingCuration(catch_all=frozenset(), skill_deny=frozenset())


def _jobs(
    family: str,
    companies: list[str],
    *,
    each: int = 1,
    band: str | None = "entry",
    skills: tuple[str, ...] = (),
    live: bool = True,
) -> list[dict[str, Any]]:
    return [
        {
            "role_family": family,
            "company_name": company,
            "seniority_level": band,
            "main_skills": list(skills),
            "is_active": live,
            "listing_confidence": "active" if live else "closed",
        }
        for company in companies
        for _ in range(each)
    ]


def _role(roles: list[dict[str, Any]], family: str) -> dict[str, Any]:
    return next(role for role in roles if role["family"] == family)


def _band(role: dict[str, Any], band: str) -> dict[str, Any]:
    return next(item for item in role["bands"] if item["band"] == band)


# ── which families qualify ──────────────────────────────────────────────────


def test_catch_all_family_is_never_offered() -> None:
    rows = _jobs("Business Operations", ["A", "B", "C"], each=20) + _jobs(
        "Business Analysis", ["A", "B", "C"], each=5
    )
    roles = compile_landing_roles(
        rows, curation=NONE._replace(catch_all=frozenset({"Business Operations"}))
    )
    assert [role["family"] for role in roles] == ["Business Analysis"]


def test_family_one_employer_dominates_is_not_offered() -> None:
    # 71 of 101 openings at one bank: a bulk template, not a market.
    rows = (
        _jobs("Banking Services", ["Bank"], each=71)
        + _jobs("Banking Services", ["B", "C", "D"], each=10)
        + _jobs("Software Development", ["A", "B", "C"], each=4)
    )
    roles = compile_landing_roles(rows, curation=NONE)
    assert [role["family"] for role in roles] == ["Software Development"]


def test_family_needs_three_employers() -> None:
    rows = _jobs("Actuarial", ["A", "B"], each=50) + _jobs("Audit", ["A", "B", "C"], each=4)
    roles = compile_landing_roles(rows, curation=NONE)
    assert [role["family"] for role in roles] == ["Audit"]


def test_family_under_the_band_floor_is_not_offered() -> None:
    # Nine openings across three employers: no market to read, as for a band.
    rows = _jobs("Payroll", ["A", "B", "C"], each=3) + _jobs("Tax", ["A", "B", "C"], each=4)
    assert BAND_MIN_JOBS == 10
    assert [role["family"] for role in compile_landing_roles(rows, curation=NONE)] == ["Tax"]


def test_every_qualifying_family_busiest_first() -> None:
    # The search reaches past the chips (L2b), so the compile keeps them all.
    rows: list[dict[str, Any]] = []
    for i in range(ROLES_SHOWN + 2):
        rows += _jobs(f"Family {i:02d}", ["A", "B", "C"], each=i + 4)
    roles = compile_landing_roles(rows, curation=NONE)
    assert len(roles) == ROLES_SHOWN + 2
    assert [role["jobs"] for role in roles] == sorted((role["jobs"] for role in roles), reverse=True)
    assert roles[0]["family"] == f"Family {ROLES_SHOWN + 1:02d}"


def test_offer_is_eight_chips_and_the_rest_by_name() -> None:
    rows: list[dict[str, Any]] = []
    for i in range(ROLES_SHOWN + 2):
        rows += _jobs(f"Family {i:02d}", ["A", "B", "C"], each=i + 4)
    roles = compile_landing_roles(rows, curation=NONE)
    offered = offer(roles)
    assert offered["roles"] == roles[:ROLES_SHOWN]
    assert offered["more"] == [
        {"family": "Family 01", "jobs": 15},
        {"family": "Family 00", "jobs": 12},
    ]


def test_no_rows_no_roles() -> None:
    assert compile_landing_roles([], curation=NONE) == []


def test_only_live_listings_are_open_now() -> None:
    # The page says "open right now": a closed or unverified ad is not open. On
    # 2026-11-26 Business Analysis had 4,807 rows and 2,301 live listings.
    rows = _jobs("Business Analysis", ["A", "B", "C"], each=4, skills=("SQL",))
    rows += _jobs("Business Analysis", ["A", "B", "C"], each=6, skills=("Excel",), live=False)
    rows += [{**row, "listing_confidence": "uncertain"} for row in _jobs("Business Analysis", ["A"], each=5)]
    role = _role(compile_landing_roles(rows, curation=NONE), "Business Analysis")
    assert role["jobs"] == 12
    assert _band(role, "entry")["jobs"] == 12
    assert [item["skill"] for item in role["skills"]] == ["SQL"]


def test_family_with_no_live_listing_is_not_offered() -> None:
    rows = _jobs("Audit", ["A", "B", "C"], each=9, live=False) + _jobs("Tax", ["A", "B", "C"], each=4)
    assert [role["family"] for role in compile_landing_roles(rows, curation=NONE)] == ["Tax"]


# ── what each role carries ──────────────────────────────────────────────────


def test_role_carries_counts_and_top_companies() -> None:
    rows = _jobs("Business Analysis", ["Deloitte"], each=6) + _jobs(
        "Business Analysis", ["KPMG", "HSBC", "EY"], each=2
    )
    role = _role(compile_landing_roles(rows, curation=NONE), "Business Analysis")
    assert role["jobs"] == 12
    assert role["companies"] == 4
    assert role["top_companies"][0] == {"name": "Deloitte", "jobs": 6}
    assert len(role["top_companies"]) == 3


def test_every_band_is_listed_in_order() -> None:
    rows = _jobs("Business Analysis", ["A", "B", "C"], each=5)
    role = _role(compile_landing_roles(rows, curation=NONE), "Business Analysis")
    assert [item["band"] for item in role["bands"]] == list(BANDS)


def test_band_thin_below_floor_and_carries_no_skills() -> None:
    per_company = BAND_MIN_JOBS  # 3 × floor entry openings, 3 intern openings
    rows = _jobs("Data Analytics", ["A", "B", "C"], each=per_company, band="entry", skills=("SQL",))
    rows += _jobs("Data Analytics", ["A", "B", "C"], each=1, band="intern", skills=("SQL",))
    role = _role(compile_landing_roles(rows, curation=NONE), "Data Analytics")
    entry, intern = _band(role, "entry"), _band(role, "intern")
    assert entry["thin"] is False
    assert entry["skills"] == [{"skill": "SQL", "share": 1.0}]
    assert intern["thin"] is True
    assert intern["jobs"] == 3
    assert intern["skills"] == []


def test_band_with_two_employers_is_thin_however_many_jobs() -> None:
    rows = _jobs("Audit", ["A", "B"], each=30, band="mid") + _jobs("Audit", ["C"], each=1, band="entry")
    role = _role(compile_landing_roles(rows, curation=NONE), "Audit")
    assert _band(role, "mid")["thin"] is True


def test_job_without_seniority_counts_for_family_not_band() -> None:
    rows = _jobs("Audit", ["A", "B", "C"], each=4, band=None, skills=("IFRS",))
    role = _role(compile_landing_roles(rows, curation=NONE), "Audit")
    assert role["jobs"] == 12
    assert all(item["jobs"] == 0 for item in role["bands"])
    assert role["skills"] == [{"skill": "IFRS", "share": 1.0}]


def test_skill_share_and_spread_rule() -> None:
    # SQL: asked by all three employers. "Requisition": one employer's template.
    rows = _jobs("Business Analysis", ["A", "B", "C"], each=4, skills=("SQL",))
    rows += _jobs("Business Analysis", ["A"], each=8, skills=("Recruiter Notes", "Excel"))
    rows += _jobs("Business Analysis", ["B", "C"], each=2, skills=("Excel",))
    role = _role(compile_landing_roles(rows, curation=NONE), "Business Analysis")
    names = [item["skill"] for item in role["skills"]]
    assert "Recruiter Notes" not in names
    # Excel: 12 openings across 3 employers, but A holds 8 of 12 (67%) — kept.
    assert names[:2] == ["SQL", "Excel"] or names[:2] == ["Excel", "SQL"]
    total = role["jobs"]
    sql = next(item for item in role["skills"] if item["skill"] == "SQL")
    assert sql["share"] == round(12 / total, 2)


def test_denied_string_is_never_a_skill() -> None:
    # "Requisition" is an ATS field label spread across employers: it passes the
    # spread rule, so only the curated deny list can stop it.
    rows = _jobs("Business Consulting", ["A", "B", "C"], each=4, skills=("Requisition", "Consulting"))
    curation = NONE._replace(skill_deny=frozenset({"Requisition"}))
    role = _role(compile_landing_roles(rows, curation=curation), "Business Consulting")
    assert [item["skill"] for item in role["skills"]] == ["Consulting"]
    assert all("Requisition" not in [s["skill"] for s in b["skills"]] for b in role["bands"])


def test_skill_that_repeats_the_role_name_is_dropped() -> None:
    rows = _jobs("Project Management", ["A", "B", "C"], each=4, skills=("project management", "Jira"))
    role = _role(compile_landing_roles(rows, curation=NONE), "Project Management")
    assert [item["skill"] for item in role["skills"]] == ["Jira"]


def test_skill_under_five_percent_is_noise() -> None:
    # 120 openings: SQL on all; Tableau on 3 (2.5%), three employers — spread
    # holds, but it is under the floor.
    rows = _jobs("Data Analytics", ["A", "B", "C"], each=39, skills=("SQL",))
    rows += _jobs("Data Analytics", ["A", "B", "C"], each=1, skills=("SQL", "Tableau"))
    role = _role(compile_landing_roles(rows, curation=NONE), "Data Analytics")
    assert [item["skill"] for item in role["skills"]] == ["SQL"]


def test_duplicate_skill_on_one_job_counts_once() -> None:
    rows = _jobs("Audit", ["A", "B", "C"], each=4, skills=("IFRS", "IFRS"))
    role = _role(compile_landing_roles(rows, curation=NONE), "Audit")
    assert role["skills"] == [{"skill": "IFRS", "share": 1.0}]


# ── the endpoint ────────────────────────────────────────────────────────────


class _FakeRepo:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls = 0

    def compile_market_analytics(self) -> dict[str, Any]:
        self.calls += 1
        return self.payload


@pytest.fixture(autouse=True)
def _reset_cache():
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()
    yield
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()


def _snapshot_roles() -> list[dict[str, Any]]:
    rows = _jobs("Business Analysis", ["A", "B", "C"], each=5, skills=("SQL",))
    return compile_landing_roles(rows, curation=NONE)


def _snapshot_with_search() -> list[dict[str, Any]]:
    """Eight chips, then two families only the search reaches."""
    rows: list[dict[str, Any]] = []
    for i in range(ROLES_SHOWN):
        rows += _jobs(f"Chip {i}", ["A", "B", "C"], each=20 + i)
    rows += _jobs("Data Analysis", ["A", "B", "C"], each=5, skills=("SQL",))
    rows += _jobs("User Interface and User Experience (UI/UX) Design", ["A", "B", "C"], each=4, skills=("Figma",))
    return compile_landing_roles(rows, curation=NONE)


def test_endpoint_serves_the_snapshot_slice(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"total_jobs": 15, "landing_roles": _snapshot_roles()})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    res = TestClient(app).get("/public/landing-roles")
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "public, max-age=60, stale-while-revalidate=3600"
    roles = res.json()["roles"]
    assert [role["family"] for role in roles] == ["Business Analysis"]
    assert [band["band"] for band in roles[0]["bands"]] == list(BANDS)
    assert res.json()["more"] == []


def test_endpoint_lists_the_rest_by_name_for_search(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"landing_roles": _snapshot_with_search()})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    body = TestClient(app).get("/public/landing-roles").json()
    assert len(body["roles"]) == ROLES_SHOWN
    assert body["more"] == [
        {"family": "Data Analysis", "jobs": 15},
        {"family": "User Interface and User Experience (UI/UX) Design", "jobs": 12},
    ]


def test_searched_family_reads_in_full(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"landing_roles": _snapshot_with_search()})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    client = TestClient(app)
    family = "User Interface and User Experience (UI/UX) Design"
    res = client.get("/public/landing-role", params={"family": family})
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "public, max-age=60, stale-while-revalidate=3600"
    role = res.json()
    assert role["family"] == family
    assert role["jobs"] == 12
    assert [item["skill"] for item in role["skills"]] == ["Figma"]
    assert [band["band"] for band in role["bands"]] == list(BANDS)
    # A chip reads from the same door, from the offer already cached.
    assert client.get("/public/landing-role", params={"family": "Chip 0"}).json()["jobs"] == 60


def test_family_not_offered_reads_and_stores_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"landing_roles": _snapshot_with_search()})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    client = TestClient(app)
    client.get("/public/landing-roles")
    before = set(shared_cache._LOCAL_CACHE)
    res = client.get("/public/landing-role", params={"family": "Alternative Therapy"})
    assert res.status_code == 404
    assert set(shared_cache._LOCAL_CACHE) == before
    assert repo.calls == 1


def test_endpoint_empty_when_snapshot_predates_roles(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"total_jobs": 15})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    res = TestClient(app).get("/public/landing-roles")
    assert res.status_code == 200
    assert res.json() == {"roles": [], "more": []}


def test_endpoint_cached_no_second_read(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"landing_roles": _snapshot_roles()})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    client = TestClient(app)
    first = client.get("/public/landing-roles").json()
    second = client.get("/public/landing-roles").json()
    assert first == second
    assert repo.calls == 1
