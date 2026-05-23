from __future__ import annotations

import asyncio
from typing import Any

from fastapi import HTTPException

from app.repositories import jobs as jobs_module
from app.repositories.jobs import CompanySearchUnavailable, JobsRepository, MarketAnalyticsCompiler
from app.routers.jobs.list import get_market_analytics, search_companies, search_jobs


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _FakeQuery:
    def __init__(self, rows: list[dict[str, Any]], *, table: str, db: "_FakeDB") -> None:
        self._rows = rows
        self._table = table
        self._db = db
        self._eq_filters: list[tuple[str, Any]] = []
        self._in_filters: list[tuple[str, list[Any]]] = []
        self._range: tuple[int, int] | None = None
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None

    def select(self, _: str) -> "_FakeQuery":
        return self

    def eq(self, key: str, value: Any) -> "_FakeQuery":
        self._eq_filters.append((key, value))
        return self

    def in_(self, key: str, values: list[Any]) -> "_FakeQuery":
        self._in_filters.append((key, values))
        return self

    def range(self, start: int, end: int) -> "_FakeQuery":
        self._range = (start, end)
        return self

    def order(self, key: str, desc: bool = False) -> "_FakeQuery":
        self._order = (key, desc)
        return self

    def limit(self, count: int) -> "_FakeQuery":
        self._limit = count
        return self

    def execute(self) -> _Result:
        rows = self._rows
        for key, value in self._eq_filters:
            rows = [r for r in rows if r.get(key) == value]
        for key, values in self._in_filters:
            rows = [r for r in rows if r.get(key) in values]
        if self._order is not None:
            key, desc = self._order
            rows = sorted(rows, key=lambda row: row.get(key) or 0, reverse=desc)
        if self._range is not None:
            start, end = self._range
            rows = rows[start: end + 1]
        if self._limit is not None:
            rows = rows[:self._limit]
        return _Result(rows)


class _SearchFakeDB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._tables.get(name, []), table=name, db=self)


class _FakeRpcQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def execute(self) -> _Result:
        return _Result(self._rows)


class _CompanySearchRpcDB:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _FakeRpcQuery:
        self.calls.append((name, params))
        return _FakeRpcQuery(self.rows)


class _UnavailableCompanySearchRepo:
    def search_companies(self, q: str, limit: int = 10) -> list[str]:
        raise CompanySearchUnavailable("company search unavailable")


class _FakeJobsRepo:
    def __init__(self) -> None:
        self.analytics_args: tuple[str | None, str | None, str | None, str | None] | None = None
        self.search_args: tuple[str, str, str | None, str | None, str | None, str | None, int, int] | None = None
        self._compiler = MarketAnalyticsCompiler()
        self._rows: list[dict[str, Any]] = [
            {
                "job_id": "j1",
                "company_name": "Acme",
                "industry": "IT Services",
                "industry_group": None,
                "role_domain": "Software Engineering",
                "batch_date": 20260504,
                "main_skills": ["Python", "SQL"],
            },
            {
                "job_id": "j2",
                "company_name": "BankCo",
                "industry": "Banking / Financial Services",
                "industry_group": None,
                "role_domain": "Finance",
                "batch_date": 20260504,
                "main_skills": ["Risk Management"],
            },
            {
                "job_id": "j3",
                "company_name": "PharmaCo",
                "industry": "Healthcare Technology",
                "industry_group": None,
                "role_domain": "Research & Science",
                "batch_date": 20260504,
                "main_skills": ["Clinical Trials"],
            },
        ]

    def compile_market_analytics(
        self,
        role_domain: str | None = None,
        *,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
    ) -> dict[str, Any]:
        self.analytics_args = (role_domain, location_city, location_country, location_mode)
        rows = list(self._rows)
        if not role_domain:
            return self._compiler.compile(rows)
        return self._compiler.compile([row for row in rows if row.get("role_domain") == role_domain])

    def search_jobs_by_filters(
        self,
        company: str,
        skill: str,
        *,
        role_domain: str | None = None,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        self.search_args = (
            company,
            skill,
            role_domain,
            location_city,
            location_country,
            location_mode,
            page,
            page_size,
        )
        rows = [{
            "job_id": "j1",
            "job_title": "Software Engineer",
            "company_name": company,
            "job_description": "Build product systems.",
            "location": "Bengaluru, India",
            "location_city": "Bengaluru",
            "location_country": "India",
            "location_mode": "onsite",
            "location_quality": "ok",
        }]
        return {
            "rows": rows,
            "available_total": len(rows),
            "returned_total": len(rows),
            "page": page,
            "page_size": page_size,
            "has_next_page": False,
        }


def test_get_market_analytics_groups_industries_and_exposes_roles() -> None:
    repo = _FakeJobsRepo()

    result = asyncio.run(get_market_analytics(repo=repo))

    assert result.total_jobs == 3
    assert result.total_companies == 3
    assert result.total_industries == 3
    assert {item.name for item in result.by_industry} == {
        "Technology",
        "BFSI",
        "Healthcare & Life Sciences",
    }
    assert {item.name for item in result.by_role} == {
        "Software Engineering",
        "Finance",
        "Research & Science",
    }


def test_get_market_analytics_passes_role_filter_to_repository() -> None:
    repo = _FakeJobsRepo()

    result = asyncio.run(get_market_analytics(role_domain="Software Engineering", repo=repo))

    assert repo.analytics_args == ("Software Engineering", None, None, None)
    assert result.total_jobs == 1
    assert result.by_role[0].name == "Software Engineering"



def test_search_jobs_passes_role_and_skill_filters() -> None:
    repo = _FakeJobsRepo()

    result = asyncio.run(
        search_jobs(
            company="Acme",
            skill="Python",
            role_domain="Software Engineering",
            location_city="Bengaluru",
            location_country="India",
            location_mode="onsite",
            page=1,
            page_size=50,
            repo=repo,
        )
    )

    assert repo.search_args == (
        "Acme",
        "Python",
        "Software Engineering",
        "Bengaluru",
        "India",
        "onsite",
        1,
        50,
    )
    assert result.available_total == 1
    assert result.returned_total == 1
    assert result.has_next_page is False
    assert result.jobs[0].company_name == "Acme"
    assert result.jobs[0].location_city == "Bengaluru"


def test_search_jobs_passes_pagination_contract() -> None:
    repo = _FakeJobsRepo()

    result = asyncio.run(
        search_jobs(
            company="Acme",
            skill="Python",
            role_domain="Software Engineering",
            page=2,
            page_size=25,
            repo=repo,
        )
    )

    assert repo.search_args == ("Acme", "Python", "Software Engineering", None, None, None, 2, 25)
    assert result.page == 2
    assert result.page_size == 25


def test_search_companies_uses_rpc_and_normalizes_results() -> None:
    db = _CompanySearchRpcDB([
        {"company_name": " Google "},
        {"company_name": "Google"},
        {"company_name": ""},
        {"company_name": "GoTo"},
    ])

    result = JobsRepository(db).search_companies(" go ", limit=2)

    assert db.calls == [("search_job_companies", {"search_term": "go", "result_limit": 2})]
    assert result == ["Google", "GoTo"]


def test_search_companies_skips_blank_queries_after_trim() -> None:
    db = _CompanySearchRpcDB([{"company_name": "Google"}])

    result = JobsRepository(db).search_companies("  ", limit=10)

    assert db.calls == []
    assert result == []


def test_search_companies_returns_503_when_repository_unavailable() -> None:
    try:
        asyncio.run(search_companies(q="go", limit=10, repo=_UnavailableCompanySearchRepo()))
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail == "Company search is temporarily unavailable."
    else:
        raise AssertionError("expected HTTPException")


def test_get_feed_updated_at_uses_last_seen_date() -> None:
    jobs_module._feed_ts_cache = (0.0, None)
    db = _SearchFakeDB({
        "jobs": [
            {"last_seen": 20260519},
            {"last_seen": 20260520},
        ]
    })

    assert JobsRepository(db).get_feed_updated_at() == "2026-05-20"


def _make_search_db(num_acme_jobs: int = 3) -> "_SearchFakeDB":
    jobs = [
        {
            "job_id": f"j{i}",
            "job_title": f"Role {i}",
            "company_name": "Acme",
            "job_description": "desc",
            "role_domain": "Engineering" if i % 2 == 0 else "Finance",
        }
        for i in range(num_acme_jobs)
    ]
    job_skills = [
        {"job_id": "j0", "skill_id": "s1", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "j2", "skill_id": "s2", "is_primary": True, "skills": {"taxonomy_key": "sql"}},
    ]
    skills = [
        {"id": "s1", "taxonomy_key": "python"},
        {"id": "s2", "taxonomy_key": "sql"},
    ]
    return _SearchFakeDB({"jobs": jobs, "job_skills": job_skills, "skills": skills})


def test_search_jobs_pagination_offset_correctness() -> None:
    jobs = [
        {"job_id": f"j{i:02d}", "job_title": f"Role {i}", "company_name": "Acme", "job_description": "desc"}
        for i in range(60)
    ]
    db = _SearchFakeDB({"jobs": jobs, "job_skills": []})
    result = JobsRepository(db).search_jobs_by_filters("Acme", "", page=2, page_size=10)

    assert result["available_total"] == 60
    assert result["returned_total"] == 10
    assert result["page"] == 2
    assert result["page_size"] == 10
    assert result["has_next_page"] is True
    assert result["rows"][0]["job_id"] == "j10"


def test_search_jobs_company_role_domain_skill_combined() -> None:
    db = _make_search_db(num_acme_jobs=3)
    result = JobsRepository(db).search_jobs_by_filters(
        "Acme", "python", role_domain="Engineering"
    )

    assert result["available_total"] == 1
    assert result["rows"][0]["job_id"] == "j0"


def test_search_jobs_empty_skill_skips_skill_filter() -> None:
    db = _make_search_db(num_acme_jobs=3)
    result = JobsRepository(db).search_jobs_by_filters("Acme", "", role_domain="Engineering")

    # Engineering jobs: j0 (i=0 even), j2 (i=2 even) — j1 is Finance
    assert result["available_total"] == 2
    assert {r["job_id"] for r in result["rows"]} == {"j0", "j2"}


def test_search_jobs_applies_location_filters_with_legacy_fallback() -> None:
    jobs = [
        {
            "job_id": "j0",
            "job_title": "Role 0",
            "company_name": "Acme",
            "job_description": "desc",
            "role_domain": "Engineering",
            "location": "Bangalore, India",  # legacy format without canonical cols
        },
        {
            "job_id": "j1",
            "job_title": "Role 1",
            "company_name": "Acme",
            "job_description": "desc",
            "role_domain": "Engineering",
            "location": "London, United Kingdom",
        },
    ]
    db = _SearchFakeDB({"jobs": jobs, "job_skills": []})
    result = JobsRepository(db).search_jobs_by_filters(
        "Acme",
        "",
        role_domain="Engineering",
        location_city="Bengaluru",
        location_mode="onsite",
    )

    assert result["available_total"] == 1
    assert result["rows"][0]["job_id"] == "j0"
    assert result["rows"][0]["location_city"] == "Bengaluru"


def test_compile_market_analytics_applies_location_filters() -> None:
    jobs = [
        {
            "job_id": "j0",
            "company_name": "Acme",
            "industry": "Technology",
            "industry_group": None,
            "role_domain": "Engineering",
            "location": "Bangalore, India",
            "batch_date": 20260504,
        },
        {
            "job_id": "j1",
            "company_name": "Globex",
            "industry": "Technology",
            "industry_group": None,
            "role_domain": "Engineering",
            "location": "London, United Kingdom",
            "batch_date": 20260504,
        },
    ]
    db = _SearchFakeDB({"jobs": jobs, "job_skills": []})
    result = JobsRepository(db).compile_market_analytics(location_country="India")
    assert result["total_jobs"] == 1
    assert result["by_location_city"][0][0] == "Bengaluru"
