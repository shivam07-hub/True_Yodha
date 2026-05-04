from __future__ import annotations

import asyncio
from typing import Any

from app.routers.jobs.list import get_market_analytics, search_jobs


class _FakeJobsRepo:
    def __init__(self) -> None:
        self.analytics_role_domain: str | None = None
        self.search_args: tuple[str | None, str | None, str | None] | None = None
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

    def fetch_analytics_rows(self, role_domain: str | None = None) -> list[dict[str, Any]]:
        self.analytics_role_domain = role_domain
        if not role_domain:
            return list(self._rows)
        return [row for row in self._rows if row.get("role_domain") == role_domain]

    def search_jobs_by_filters(
        self,
        company: str | None,
        skill: str | None,
        role_domain: str | None = None,
    ) -> list[dict[str, Any]]:
        self.search_args = (company, skill, role_domain)
        return [
            {
                "job_id": "j1",
                "job_title": "Software Engineer",
                "company_name": company or "Acme",
                "job_description": "Build product systems.",
            }
        ]


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
            repo=repo,
        )
    )

    assert repo.search_args == ("Acme", "Python", "Software Engineering")
    assert result.total == 1
    assert result.jobs[0].company_name == "Acme"
