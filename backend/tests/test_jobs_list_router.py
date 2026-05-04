from __future__ import annotations

import asyncio
from typing import Any

from app.repositories.jobs import MarketAnalyticsCompiler
from app.routers.jobs.list import get_market_analytics, search_jobs


class _FakeJobsRepo:
    def __init__(self) -> None:
        self.analytics_role_domain: str | None = None
        self.search_args: tuple[str, str, str | None, int, int] | None = None
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

    def compile_market_analytics(self, role_domain: str | None = None) -> dict[str, Any]:
        self.analytics_role_domain = role_domain
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
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        self.search_args = (company, skill, role_domain, page, page_size)
        rows = [{
            "job_id": "j1",
            "job_title": "Software Engineer",
            "company_name": company,
            "job_description": "Build product systems.",
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

    assert repo.analytics_role_domain == "Software Engineering"
    assert result.total_jobs == 1
    assert result.by_role[0].name == "Software Engineering"


def test_search_jobs_passes_role_and_skill_filters() -> None:
    repo = _FakeJobsRepo()

    result = asyncio.run(
        search_jobs(
            company="Acme",
            skill="Python",
            role_domain="Software Engineering",
            page=1,
            page_size=50,
            repo=repo,
        )
    )

    assert repo.search_args == ("Acme", "Python", "Software Engineering", 1, 50)
    assert result.available_total == 1
    assert result.returned_total == 1
    assert result.has_next_page is False
    assert result.jobs[0].company_name == "Acme"


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

    assert repo.search_args == ("Acme", "Python", "Software Engineering", 2, 25)
    assert result.page == 2
    assert result.page_size == 25
