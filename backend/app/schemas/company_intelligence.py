from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CompanySkillProfileItem(BaseModel):
    skill_id: int
    display_name: str
    taxonomy_key: str
    domain: str
    current_job_count: int
    peak_job_count: int
    observation_run_count: int
    avg_required_level: float | None
    trend_signal: Literal["emerging", "steady", "declining", "dormant"]
    first_seen_at: datetime
    last_seen_at: datetime


class CompanyNewsletterSkillSummary(BaseModel):
    top_skills: list[str]
    emerging_skills: list[str]
    declining_skills: list[str]
    dormant_skills: list[str]


class CompanySkillIntelligenceResponse(BaseModel):
    company_id: int
    company_name: str
    slug: str
    as_of: datetime | None
    source_run_id: str | None
    skills: list[CompanySkillProfileItem]
    newsletter_summary: CompanyNewsletterSkillSummary
