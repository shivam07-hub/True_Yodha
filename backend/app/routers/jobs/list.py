from collections import Counter

from fastapi import APIRouter, Depends

from app.repositories.jobs import JobsRepository, get_public_jobs_repository
from app.schemas import (
    JobSearchResponse,
    MarketAnalyticsResponse,
    NameCountItem,
    SkillCountItem,
)
from app.schemas.jobs import JobSearchItem

router = APIRouter()


@router.get("/analytics", response_model=MarketAnalyticsResponse)
async def get_market_analytics(
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> MarketAnalyticsResponse:
    rows = repo.fetch_analytics_rows()

    company_counts: Counter[str] = Counter()
    industry_counts: Counter[str] = Counter()
    skill_counts: Counter[str] = Counter()
    company_skill_counters: dict[str, Counter[str]] = {}
    industry_skill_counters: dict[str, Counter[str]] = {}
    batch_dates: list[int] = []

    for row in rows:
        company = row.get("company_name")
        industry = row.get("industry")
        skills = [skill.strip() for skill in (row.get("main_skills") or []) if skill]

        if company:
            company_counts[company] += 1
            if company not in company_skill_counters:
                company_skill_counters[company] = Counter()
            company_skill_counters[company].update(skills)
        if industry:
            industry_counts[industry] += 1
            if industry not in industry_skill_counters:
                industry_skill_counters[industry] = Counter()
            industry_skill_counters[industry].update(skills)
        if row.get("batch_date"):
            batch_dates.append(row["batch_date"])
        for skill in skills:
            skill_counts[skill] += 1

    company_skills = {
        company: [skill for skill, _ in counter.most_common(12)]
        for company, counter in company_skill_counters.items()
    }
    industry_skills = {
        industry: [skill for skill, _ in counter.most_common(12)]
        for industry, counter in industry_skill_counters.items()
    }

    return MarketAnalyticsResponse(
        total_jobs=len(rows),
        total_companies=len(company_counts),
        total_industries=len(industry_counts),
        latest_batch=str(max(batch_dates)) if batch_dates else None,
        by_company=[NameCountItem(name=name, count=count) for name, count in company_counts.most_common()],
        by_industry=[NameCountItem(name=name, count=count) for name, count in industry_counts.most_common()],
        top_skills=[SkillCountItem(skill=skill, count=count) for skill, count in skill_counts.most_common(20)],
        company_skills=company_skills,
        industry_skills=industry_skills,
    )


@router.get("/search", response_model=JobSearchResponse)
async def search_jobs(
    company: str | None = None,
    skill: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> JobSearchResponse:
    rows = repo.search_jobs_by_filters(company, skill)
    items = [
        JobSearchItem(
            job_id=row["job_id"],
            job_title=row.get("job_title") or "",
            company_name=row.get("company_name"),
            job_description=row.get("job_description"),
        )
        for row in rows
    ]
    return JobSearchResponse(jobs=items, total=len(items))
