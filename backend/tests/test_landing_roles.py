"""Spec #66 L1 — the landing's role chips, open jobs and skills per band.

Two halves: the pure compile that runs inside the market snapshot write, and
`GET /public/landing-roles`, which only slices that snapshot.
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
    compile_landing_roles,
)

NONE: frozenset[str] = frozenset()


def _jobs(
    family: str,
    companies: list[str],
    *,
    each: int = 1,
    band: str | None = "entry",
    skills: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    return [
        {
            "role_family": family,
            "company_name": company,
            "seniority_level": band,
            "main_skills": list(skills),
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
    roles = compile_landing_roles(rows, catch_all=frozenset({"Business Operations"}))
    assert [role["family"] for role in roles] == ["Business Analysis"]


def test_family_one_employer_dominates_is_not_offered() -> None:
    # 71 of 101 openings at one bank: a bulk template, not a market.
    rows = (
        _jobs("Banking Services", ["Bank"], each=71)
        + _jobs("Banking Services", ["B", "C", "D"], each=10)
        + _jobs("Software Development", ["A", "B", "C"], each=3)
    )
    roles = compile_landing_roles(rows, catch_all=NONE)
    assert [role["family"] for role in roles] == ["Software Development"]


def test_family_needs_three_employers() -> None:
    rows = _jobs("Actuarial", ["A", "B"], each=50) + _jobs("Audit", ["A", "B", "C"], each=2)
    roles = compile_landing_roles(rows, catch_all=NONE)
    assert [role["family"] for role in roles] == ["Audit"]


def test_busiest_eight_in_order() -> None:
    rows: list[dict[str, Any]] = []
    for i in range(ROLES_SHOWN + 2):
        rows += _jobs(f"Family {i:02d}", ["A", "B", "C"], each=i + 1)
    roles = compile_landing_roles(rows, catch_all=NONE)
    assert len(roles) == ROLES_SHOWN
    assert [role["jobs"] for role in roles] == sorted((role["jobs"] for role in roles), reverse=True)
    assert roles[0]["family"] == f"Family {ROLES_SHOWN + 1:02d}"


def test_no_rows_no_roles() -> None:
    assert compile_landing_roles([], catch_all=NONE) == []


# ── what each role carries ──────────────────────────────────────────────────


def test_role_carries_counts_and_top_companies() -> None:
    rows = _jobs("Business Analysis", ["Deloitte"], each=6) + _jobs(
        "Business Analysis", ["KPMG", "HSBC", "EY"], each=2
    )
    role = _role(compile_landing_roles(rows, catch_all=NONE), "Business Analysis")
    assert role["jobs"] == 12
    assert role["companies"] == 4
    assert role["top_companies"][0] == {"name": "Deloitte", "jobs": 6}
    assert len(role["top_companies"]) == 3


def test_every_band_is_listed_in_order() -> None:
    rows = _jobs("Business Analysis", ["A", "B", "C"], each=5)
    role = _role(compile_landing_roles(rows, catch_all=NONE), "Business Analysis")
    assert [item["band"] for item in role["bands"]] == list(BANDS)


def test_band_thin_below_floor_and_carries_no_skills() -> None:
    per_company = BAND_MIN_JOBS  # 3 × floor entry openings, 3 intern openings
    rows = _jobs("Data Analytics", ["A", "B", "C"], each=per_company, band="entry", skills=("SQL",))
    rows += _jobs("Data Analytics", ["A", "B", "C"], each=1, band="intern", skills=("SQL",))
    role = _role(compile_landing_roles(rows, catch_all=NONE), "Data Analytics")
    entry, intern = _band(role, "entry"), _band(role, "intern")
    assert entry["thin"] is False
    assert entry["skills"] == [{"skill": "SQL", "share": 1.0}]
    assert intern["thin"] is True
    assert intern["jobs"] == 3
    assert intern["skills"] == []


def test_band_with_two_employers_is_thin_however_many_jobs() -> None:
    rows = _jobs("Audit", ["A", "B"], each=30, band="mid") + _jobs("Audit", ["C"], each=1, band="entry")
    role = _role(compile_landing_roles(rows, catch_all=NONE), "Audit")
    assert _band(role, "mid")["thin"] is True


def test_job_without_seniority_counts_for_family_not_band() -> None:
    rows = _jobs("Audit", ["A", "B", "C"], each=4, band=None, skills=("IFRS",))
    role = _role(compile_landing_roles(rows, catch_all=NONE), "Audit")
    assert role["jobs"] == 12
    assert all(item["jobs"] == 0 for item in role["bands"])
    assert role["skills"] == [{"skill": "IFRS", "share": 1.0}]


def test_skill_share_and_spread_rule() -> None:
    # SQL: asked by all three employers. "Requisition": one employer's template.
    rows = _jobs("Business Analysis", ["A", "B", "C"], each=4, skills=("SQL",))
    rows += _jobs("Business Analysis", ["A"], each=8, skills=("Requisition", "Excel"))
    rows += _jobs("Business Analysis", ["B", "C"], each=2, skills=("Excel",))
    role = _role(compile_landing_roles(rows, catch_all=NONE), "Business Analysis")
    names = [item["skill"] for item in role["skills"]]
    assert "Requisition" not in names
    # Excel: 12 openings across 3 employers, but A holds 8 of 12 (67%) — kept.
    assert names[:2] == ["SQL", "Excel"] or names[:2] == ["Excel", "SQL"]
    total = role["jobs"]
    sql = next(item for item in role["skills"] if item["skill"] == "SQL")
    assert sql["share"] == round(12 / total, 2)


def test_duplicate_skill_on_one_job_counts_once() -> None:
    rows = _jobs("Audit", ["A", "B", "C"], each=4, skills=("IFRS", "IFRS"))
    role = _role(compile_landing_roles(rows, catch_all=NONE), "Audit")
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
    return compile_landing_roles(rows, catch_all=NONE)


def test_endpoint_serves_the_snapshot_slice(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"total_jobs": 15, "landing_roles": _snapshot_roles()})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    res = TestClient(app).get("/public/landing-roles")
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "public, max-age=60, stale-while-revalidate=3600"
    roles = res.json()["roles"]
    assert [role["family"] for role in roles] == ["Business Analysis"]
    assert [band["band"] for band in roles[0]["bands"]] == list(BANDS)


def test_endpoint_empty_when_snapshot_predates_roles(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"total_jobs": 15})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    res = TestClient(app).get("/public/landing-roles")
    assert res.status_code == 200
    assert res.json() == {"roles": []}


def test_endpoint_cached_no_second_read(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"landing_roles": _snapshot_roles()})
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)

    client = TestClient(app)
    first = client.get("/public/landing-roles").json()
    second = client.get("/public/landing-roles").json()
    assert first == second
    assert repo.calls == 1
