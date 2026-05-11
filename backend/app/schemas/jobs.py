from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel


class ActionPlanDay(BaseModel):
    day: int
    focus: str              # skill display name
    tasks: list[str]        # 1–3 concrete tasks for that day


class SkillGapItem(BaseModel):
    skill: str
    is_primary: bool
    user_level: int          # 0 = user doesn't have this skill
    required_level: int      # from job_skills.required_level; fallback: primary→4, secondary→2
    missing: bool


class SkillGapResponse(BaseModel):
    job_id: str
    job_title: str
    company: str | None
    skills: list[SkillGapItem]
    gap_pct: int            # % of required skills the user is missing
    total_required: int
    missing_count: int


class UserSkillDemandItem(BaseModel):
    skill: str
    display_name: str
    current_level: int
    proficiency_title: str
    target_level: int | None = None
    needs_upgrade: bool
    job_count_30d: int
    weighted_demand: int


class UserSkillDemandResponse(BaseModel):
    skills: list[UserSkillDemandItem]
    total: int


class JobMatchResponse(BaseModel):
    id: int                             # user_job_matches.id
    job_id: str
    title: str
    company: str | None
    location: str | None
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    location_quality: str | None = None
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
    feed_updated_at: datetime | None = None    # MAX(jobs.created_at) — when the feed last grew
    matches_computed_at: datetime | None = None  # when this user's matches were last computed


class ApplicationStatusUpdate(BaseModel):
    status: str     # pending | applied | no_response | responded | interviewing | rejected | offer | abandoned
    notes: str | None = None
    company_response: str | None = None
    followed_up: bool | None = None


class ComputeJobMatchesResponse(BaseModel):
    matches_written: int     # rows upserted to user_job_matches
    from_cache: bool         # True if LLM was skipped (already computed this week)
    batch_week: date
    needs_onboarding: bool = False
    debug: dict[str, int | bool | None] | None = None
    status: Literal["idle", "queued", "running", "succeeded", "failed"] = "queued"
    already_running: bool = False
    job_id: str | None = None
    message: str | None = None


class JobComputeStatusResponse(BaseModel):
    user_id: str
    batch_week: date
    status: Literal["idle", "queued", "running", "succeeded", "failed"]
    job_id: str | None = None
    already_running: bool = False
    matches_written: int | None = None
    from_cache: bool | None = None
    needs_onboarding: bool | None = None
    debug: dict[str, Any] | None = None
    message: str | None = None
    error: str | None = None
    enqueued_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ApplicationResponse(BaseModel):
    id: int
    job_id: str
    title: str
    company: str | None
    job_description: str | None = None
    status: str
    source: str = "system_match"
    applied_at: datetime | None
    response_at: datetime | None
    checkin_sent_at: datetime | None
    followed_up_at: datetime | None = None
    closed_at: datetime | None = None
    offer_received_at: datetime | None = None
    notes: str | None
    created_at: datetime


class JobPathTargetInput(BaseModel):
    skill: str
    is_primary: bool | None = None


class JobPathTargetsRequest(BaseModel):
    targets: list[JobPathTargetInput]


class JobPathSkillTarget(BaseModel):
    skill: str
    is_primary: bool
    selected_at: datetime | None = None
    proof_count: int = 0


class JobPathMilestoneUpdate(BaseModel):
    proof: str | None = None
    impact: str | None = None
    confidence: float | None = None
    completed: bool = True


class JobPathMilestoneResponse(BaseModel):
    id: str
    milestone_date: date
    skill: str
    is_primary: bool
    template_id: str | None = None
    title: str
    action: str
    proof_prompt: str | None = None
    impact_prompt: str | None = None
    proof: str | None = None
    impact: str | None = None
    confidence: float | None = None
    completed_at: datetime | None = None


class JobPathCVSummary(BaseModel):
    id: int | None = None
    confidence: dict
    snapshot_hash: str | None = None
    ai_polished: bool = False
    created_at: datetime | None = None


class JobPathResponse(BaseModel):
    job_id: str
    job_title: str
    company: str | None = None
    readiness_pct: int
    readiness_tier: dict
    target_skills: list[JobPathSkillTarget]
    milestones: list[JobPathMilestoneResponse]
    today_milestone: JobPathMilestoneResponse | None = None
    cv: JobPathCVSummary | None = None
    follow_up: dict | None = None
    status: str
    applied_at: datetime | None = None


class JobCVGenerateRequest(BaseModel):
    ai_polish: bool = False


class JobCVGenerateResponse(BaseModel):
    id: int
    job_id: str
    cv_text: str
    polished_text: str | None = None
    confidence: dict
    snapshot_hash: str
    from_cache: bool
    ai_polish_used: int
    ai_polish_limit: int
    limit_reached: bool = False
    polish_unavailable: bool = False


class SkillSuggestion(BaseModel):
    label: str
    taxonomy_key: str | None = None
    normalized_label: str | None = None
    skill_type: str | None = None
    confidence: float = 0.0


class EmergingSkillInput(BaseModel):
    label: str
    skill_type: str
    source: str = "user_added"


class JobImportPreviewRequest(BaseModel):
    source_url: str | None = None
    source_platform: str | None = None
    role_name: str
    company_name: str | None = None
    location: str | None = None
    job_description: str
    page_title: str | None = None
    capture_method: str = "visible_page"


class JobImportPreviewResponse(BaseModel):
    role_name: str
    company_name: str | None = None
    location: str | None = None
    job_description: str
    primary_skills: list[SkillSuggestion]
    secondary_skills: list[SkillSuggestion]
    emerging_skills: list[SkillSuggestion]
    warnings: list[str] = []


class JobImportRequest(BaseModel):
    source_url: str | None = None
    source_platform: str | None = None
    role_name: str
    company_name: str | None = None
    location: str | None = None
    job_description: str
    primary_skills: list[str] = []
    secondary_skills: list[str] = []
    emerging_skills: list[EmergingSkillInput] = []
    capture_method: str = "visible_page"


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
    location: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    location_quality: str | None = None


class JobSearchResponse(BaseModel):
    jobs: list[JobSearchItem]
    available_total: int
    returned_total: int
    page: int
    page_size: int
    has_next_page: bool


class MarketAnalyticsResponse(BaseModel):
    total_jobs: int
    total_companies: int
    total_industries: int
    latest_batch: str | None
    by_company: list[NameCountItem]
    by_industry: list[NameCountItem]
    by_role: list[NameCountItem] = []
    by_location_city: list[NameCountItem] = []
    by_location_country: list[NameCountItem] = []
    by_location_mode: list[NameCountItem] = []
    top_skills: list[SkillCountItem]
    company_skills: dict[str, list[str]] = {}
    industry_skills: dict[str, list[str]] = {}
    company_skill_counts: dict[str, list[SkillCountItem]] = {}
    industry_skill_counts: dict[str, list[SkillCountItem]] = {}


class MarketAnalyticsSummaryResponse(BaseModel):
    total_jobs: int
    total_companies: int
    total_industries: int
    latest_batch: str | None
    by_company: list[NameCountItem]
    by_industry: list[NameCountItem]
    by_role: list[NameCountItem] = []
    by_location_city: list[NameCountItem] = []
    by_location_country: list[NameCountItem] = []
    by_location_mode: list[NameCountItem] = []


class EntitySkillsResponse(BaseModel):
    entity: str
    type: str
    skills: list[SkillCountItem]



class SkillHeatmapResponse(BaseModel):
    matrix: dict[str, dict[str, int]]  # company_name -> skill_display_name -> job_count
