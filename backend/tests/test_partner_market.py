"""`/partner/v1/market/*` — market answers for the open MCP door (#63 §3A).

The routes hold no person, so the scope check is what keeps them from being an
unmetered copy of the paid feed for anyone who finds the URL.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.partners import PartnerCredential
from app.repositories.role_families import (
    RoleFamiliesRepository,
    family_match_score,
    rank_families,
)
from app.routers.partner import market as market_router
from app.security import partner_auth
from app.security.partner_auth import (
    ALL_SCOPES,
    SCOPE_MARKET_READ,
    SCOPE_ROLES_READ,
    get_partner_credential,
)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _uncached(monkeypatch) -> None:
    monkeypatch.setattr(
        market_router.shared_cache, "get_or_compute", lambda _key, compute, **_kw: compute()
    )


def _as_partner(monkeypatch, scopes: set[str]) -> None:
    monkeypatch.setattr(partner_auth, "_enforce_rate_limit", lambda _key_id: None)
    app.dependency_overrides[get_partner_credential] = lambda: PartnerCredential(
        key_id="k1", partner_id="p1", slug="myro-mcp", name="Myro MCP",
        scopes=frozenset(scopes),
    )


class _FakeJobs:
    def __init__(self) -> None:
        self.kwargs: dict[str, Any] = {}

    def public_job_query(self, **kwargs: Any) -> dict[str, Any]:
        self.kwargs = kwargs
        return {
            "rows": [
                {
                    "job_id": "j1",
                    "job_title": "Product Manager",
                    "company_name": "Acme",
                    "location_city": "Bengaluru",
                    "location_country": "India",
                    "location_mode": "hybrid",
                    "first_seen": 20261120,
                    "job_description": "a stranger's writing",
                    "role_domain": "product",
                },
                {"job_id": None, "job_title": "no id"},
            ],
            "total": 1,
            "relaxed": [],
        }


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FamilyTable:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.eqs: list[tuple[str, Any]] = []

    def table(self, _name: str) -> "_FamilyTable":
        return self

    def select(self, *_a: Any) -> "_FamilyTable":
        return self

    def eq(self, column: str, value: Any) -> "_FamilyTable":
        self.eqs.append((column, value))
        return self

    def execute(self) -> _Result:
        return _Result(self.rows)


FAMILIES = [
    {"family": "Product Development", "open_count": 83, "core_skills": ["Product Engineering"],
     "label": "Senior Specialist, Full-Stack Engineer", "refreshed_at": "2026-11-17T10:20:00+00:00"},
    {"family": "Product Management", "open_count": 143, "core_skills": ["Product Strategy", "Roadmaps"],
     "label": "PLM Windchill Consultant", "refreshed_at": "2026-11-17T10:20:00+00:00"},
    {"family": "Banking Services", "open_count": 6288, "core_skills": ["Banking"],
     "label": "Teller", "refreshed_at": "2026-11-17T10:20:00+00:00"},
]


def test_market_read_is_a_known_scope_and_not_the_paid_feed():
    assert SCOPE_MARKET_READ in ALL_SCOPES
    assert SCOPE_MARKET_READ != SCOPE_ROLES_READ


@pytest.mark.parametrize("path", ["/partner/v1/market/jobs?role=pm", "/partner/v1/market/role-skills?role=pm"])
def test_no_key_is_401(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", ["/partner/v1/market/jobs?role=pm", "/partner/v1/market/role-skills?role=pm"])
def test_a_key_without_market_read_is_403(client, monkeypatch, path):
    _as_partner(monkeypatch, {SCOPE_ROLES_READ})

    response = client.get(path)

    assert response.status_code == 403
    assert "market.read" in response.json()["detail"]


def test_jobs_hands_the_structured_filters_to_the_public_query(client, monkeypatch):
    _as_partner(monkeypatch, {SCOPE_MARKET_READ})
    fake = _FakeJobs()
    monkeypatch.setattr(market_router, "get_public_jobs_repository", lambda: fake)

    response = client.get(
        "/partner/v1/market/jobs",
        params={"role": "  product   manager ", "city": "Bengaluru", "mode": "hybrid", "limit": 5},
    )

    assert response.status_code == 200
    assert fake.kwargs == {
        "role": "product manager",
        "location_city": "Bengaluru",
        "location_country": None,
        "location_mode": "hybrid",
        "limit": 5,
    }
    body = response.json()
    assert body["total"] == 1 and body["relaxed"] == []
    assert body["jobs"] == [{
        "job_id": "j1",
        "title": "Product Manager",
        "company": "Acme",
        "location_city": "Bengaluru",
        "location_country": "India",
        "work_mode": "hybrid",
        "first_seen": "2026-11-20",
    }]


@pytest.mark.parametrize(
    "params",
    [{"role": "p"}, {"role": "pm", "limit": 21}, {"role": "pm", "mode": "office"}, {}],
)
def test_jobs_refuses_what_it_cannot_answer(client, monkeypatch, params):
    _as_partner(monkeypatch, {SCOPE_MARKET_READ})
    monkeypatch.setattr(market_router, "get_public_jobs_repository", _FakeJobs)

    assert client.get("/partner/v1/market/jobs", params=params).status_code == 422


def test_role_skills_returns_the_best_named_family_first_without_its_label(client, monkeypatch):
    _as_partner(monkeypatch, {SCOPE_MARKET_READ})
    _uncached(monkeypatch)
    table = _FamilyTable(FAMILIES)
    monkeypatch.setattr(market_router, "get_supabase_admin", lambda: table)

    response = client.get("/partner/v1/market/role-skills", params={"role": "Senior Product Manager"})

    assert response.status_code == 200
    body = response.json()
    assert [f["family"] for f in body["families"]] == ["Product Management", "Product Development"]
    assert body["families"][0] == {
        "family": "Product Management",
        "open_roles": 143,
        "core_skills": ["Product Strategy", "Roadmaps"],
    }
    assert "label" not in response.text


def test_role_skills_with_no_named_family_is_empty_not_missing(client, monkeypatch):
    _as_partner(monkeypatch, {SCOPE_MARKET_READ})
    _uncached(monkeypatch)
    monkeypatch.setattr(market_router, "get_supabase_admin", lambda: _FamilyTable(FAMILIES))

    response = client.get("/partner/v1/market/role-skills", params={"role": "astronaut"})

    assert response.status_code == 200
    assert response.json()["families"] == []
    assert response.json()["refreshed_at"] is None


@pytest.mark.parametrize(
    ("role", "family", "wins"),
    [
        ("product manager", "Product Management", True),
        ("software engineer", "Software Development", True),
        ("senior data scientist", "Data Science", True),
        ("hr manager", "Human Resources Management and Planning", True),
        ("ux designer", "User Interface and User Experience (UI/UX) Design", True),
        ("engineer", "Software Engineering", False),
        ("manager", "Project Management", False),
        ("senior", "Senior Living", False),
        ("investment analyst", "Investment Management", True),
        ("investment banking analyst", "Criminal Investigation and Forensics", False),
        ("electrical engineer", "Electronics Engineering", False),
        ("cloud engineer", "C and C++", False),
        ("content writer", "E-Commerce", False),
    ],
)
def test_family_match_score(role, family, wins):
    assert (family_match_score(role, family) > 0) is wins


def test_a_seat_word_breaks_a_tie_but_never_beats_a_field_word():
    assert family_match_score("product manager", "Product Management") > family_match_score(
        "product manager", "Product Development"
    )
    assert family_match_score("devops engineer", "Cloud Computing") > family_match_score(
        "devops engineer", "Electrical and Computer Engineering"
    )


def test_rank_families_bounds_the_answer():
    rows = rank_families("product", FAMILIES, limit=1)

    assert [r["family"] for r in rows] == ["Product Management"]


def test_named_families_leaves_out_catch_alls_and_never_reads_label():
    table = _FamilyTable(FAMILIES)
    selected: list[str] = []
    table.select = lambda columns: (selected.append(columns), table)[1]  # type: ignore[method-assign]

    RoleFamiliesRepository(table).named_families()

    assert ("is_catch_all", False) in table.eqs
    assert "label" not in selected[0]
