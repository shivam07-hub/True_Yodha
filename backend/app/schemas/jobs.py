from datetime import date, datetime
from pydantic import BaseModel


class ActionPlanDay(BaseModel):
    day: int
    focus: str              # skill display name
    tasks: list[str]        # 1–3 concrete tasks for that day


class SkillGapItem(BaseModel):
    skill: str
    is_primary: bool        # True = main_skill, False = side_skill
    user_level: int | None  # None = user doesn't have this skill
    missing: bool


class SkillGapResponse(BaseModel):
    job_id: str
    job_title: str
    company: str | None
    skills: list[SkillGapItem]
    gap_pct: int            # % of required skills the user is missing
    total_required: int
    missing_count: int


class JobMatchResponse(BaseModel):
    id: int                             # user_job_matches.id
    job_id: str
    title: str
    company: str | None
    location: str | None
    industry: str | None = None
    remote: bool
    overlap_score: float                # 0–100
    llm_rank: int | None                # 1–3 within this week's batch
    llm_explanation: str | None         # why this job fits (2–3 sentences)
    action_plan: list[ActionPlanDay]    # 7-day gap-closing plan
    batch_week: date                    # Monday this match was generated
    source_url: str | None
    matched_skills: list[str] = []
    job_description: str | None = None


class JobMatchesResponse(BaseModel):
    jobs: list[JobMatchResponse]
    batch_week: date        # Monday of the current week's batch
    total: int


class ApplicationStatusUpdate(BaseModel):
    status: str     # pending | applied | no_response | responded | interviewing | rejected | offer
    notes: str | None = None
    company_response: str | None = None


class ComputeJobMatchesResponse(BaseModel):
    matches_written: int     # rows upserted to user_job_matches
    from_cache: bool         # True if LLM was skipped (already computed this week)
    batch_week: date
    needs_onboarding: bool = False


class ApplicationResponse(BaseModel):
    id: int
    job_id: str
    title: str
    company: str | None
    job_description: str | None = None
    status: str
    applied_at: datetime | None
    response_at: datetime | None
    checkin_sent_at: datetime | None
    notes: str | None
    created_at: datetime


class NameCountItem(BaseModel):
    name: str
    count: int


class SkillCountItem(BaseModel):
    skill: str
    count: int


class JobSearchItem(BaseModel):
    job_id: str
    job_title: str
    company_name: str | None
    job_description: str | None


class JobSearchResponse(BaseModel):
    jobs: list[JobSearchItem]
    total: int


class MarketAnalyticsResponse(BaseModel):
    total_jobs: int
    total_companies: int
    total_industries: int
    latest_batch: str | None
    by_company: list[NameCountItem]
    by_industry: list[NameCountItem]
    top_skills: list[SkillCountItem]
    company_skills: dict[str, list[str]] = {}
    industry_skills: dict[str, list[str]] = {}


class SkillGapItem(BaseModel):
    skill: str
    is_primary: bool        # True = main_skill, False = side_skill
    user_level: int | None  # None = user doesn't have this skill
    missing: bool


class SkillGapResponse(BaseModel):
    job_id: str
    job_title: str
    company: str | None
    skills: list[SkillGapItem]
    gap_pct: int            # % of required skills the user is missing
    total_required: int
    missing_count: int
