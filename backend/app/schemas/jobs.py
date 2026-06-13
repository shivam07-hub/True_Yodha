from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel


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
    # Percentile band of weighted_demand across the user's set. Single source of
    # truth for the demand badge. very_high | high | moderate | low | none.
    demand_band: str = "none"


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
    locations: list[str] = []
    industry: str | None = None
    remote: bool
    overlap_score: float                # 0–100 (deterministic skill overlap)
    llm_rank: int | None                # rank within this week's batch
    llm_explanation: str | None         # back-compat: mirrors `summary`
    batch_week: date                    # Monday this match was generated
    source_url: str | None
    matched_skills: list[str] = []
    job_description: str | None = None
    first_seen: str | None = None
    last_seen_at: str | None = None
    is_stale: bool = False
    is_active: bool = True
    # Matching Brain (Career Ops 5-axis eval) — null until the LLM stage runs
    overall_score: float | None = None  # 0.0–5.0
    grade: str | None = None            # A+|A|A-|B+|B|B-|C+|C|C-|D|F
    recommendation: str | None = None   # Apply|Negotiate|Skip
    application_angle: str | None = None
    summary: str | None = None
    role_fit: float | None = None       # 0.0–5.0
    comp_fit: float | None = None
    growth_fit: float | None = None
    culture_fit: float | None = None
    risk_score: float | None = None     # HIGHER = riskier
    strengths: list[str] = []
    concerns: list[str] = []


class JobMatchesResponse(BaseModel):
    jobs: list[JobMatchResponse]
    batch_week: date        # Monday of the current week's batch
    total: int
    feed_updated_at: datetime | None = None    # MAX(jobs.last_seen) — when the feed last refreshed
    matches_computed_at: datetime | None = None  # when this user's matches were last computed
    dismissed_job_ids: list[str] = []


APPLICATION_STAGES = {"saved", "applied", "screening", "interviewing", "final_round"}
APPLICATION_OUTCOMES = {"ghosted", "rejected", "offer", "withdrew"}
APPLICATION_STATUSES = APPLICATION_STAGES | APPLICATION_OUTCOMES


class ApplicationStatusUpdate(BaseModel):
    status: str     # saved | applied | screening | interviewing | final_round | ghosted | rejected | offer | withdrew
    notes: str | None = None
    company_response: str | None = None
    followed_up: bool | None = None


class ApplicationReviewRequest(BaseModel):
    star_rating: int            # 1–5
    last_stage: str             # one of APPLICATION_STAGES
    written_note: str | None = None


class ApplicationReviewResponse(BaseModel):
    id: str
    job_application_id: int
    company_name: str
    star_rating: int
    last_stage: str
    outcome: str
    written_note: str | None
    created_at: datetime


class StaleApplicationItem(BaseModel):
    id: int
    job_id: str
    title: str
    company: str | None
    status: str
    updated_at: datetime | None
    last_stage_changed_at: datetime | None = None


class CompanyReviewItem(BaseModel):
    star_rating: int
    last_stage: str
    outcome: str
    written_note: str | None
    created_at: datetime


class CompanyPageResponse(BaseModel):
    company_name: str
    avg_star_rating: float | None
    review_count: int
    ghost_rate: float | None        # 0.0–1.0, None if no reviews
    stage_breakdown: dict[str, int]  # last_stage → count
    reviews: list[CompanyReviewItem]


class CompanyJobCardItem(BaseModel):
    job_id: str
    title: str
    location: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    primary_skills: list[str] = []


class CompanyJobsResponse(BaseModel):
    company_name: str
    total: int
    jobs: list[CompanyJobCardItem]
    page: int
    page_size: int
    has_next: bool


class RefreshTicketResponse(BaseModel):
    """POST /jobs/refresh — XP already charged at this point."""
    id: str
    state: Literal["queued", "computing", "done"]
    progress_label: str
    batch_week: date
    xp_charged: int
    new_xp_balance: int
    matches_written: int | None = None


class RefreshStateResponse(BaseModel):
    """GET /jobs/refresh/{ticket_id} — polled by frontend every ~1s."""
    ticket_id: str
    state: Literal["queued", "computing", "done", "failed"]
    progress_label: str
    batch_week: date
    matches_written: int | None = None
    refund: int | None = None
    new_xp_balance: int | None = None
    outcome_kind: Literal["written", "cache_hit", "exhausted", "needs_onboarding"] | None = None
    error: str | None = None
    debug: dict[str, Any] | None = None


class CVBadge(BaseModel):
    """Summary of an application's Company CV Thread head — rendered on tracker cards.

    See CONTEXT.md ("Company CV Thread") for the canonical-CV rule.
    """
    version_id: int
    version_number: int
    kind: str
    polished: bool


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
    last_stage_changed_at: datetime | None = None  # Q7 — stale-clock signal
    is_first_offer: bool = False                    # Q6 — set true on the first-ever offer per user (transient)
    cv_badge: CVBadge | None = None                 # CV3/CV4 — Company CV Thread head for this row's company
    xp_earned: int | None = None                    # +XP granted on this add (transient — only set by POST /import)
    xp_balance: int | None = None                   # wallet balance after the reward (transient)


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
    status: str = "saved"  # one of APPLICATION_STATUSES; manual web add sends "applied", extension defaults to saved


class JobFileExtractResponse(BaseModel):
    """Fields lifted from an uploaded job posting (PDF / DOCX / image)."""
    company: str = ""
    role: str = ""
    location: str = ""
    job_description: str = ""


class NameCountItem(BaseModel):
    name: str
    count: int
    last_seen_at: str | None = None
    velocity_bins: list[int] | None = None
    country: str | None = None
    industry: str | None = None


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


class JobFeedItem(BaseModel):
    """One job card in the authed /market feed (browse, not scored)."""

    job_id: str
    job_title: str
    company_name: str | None
    job_description: str | None
    location: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    location_quality: str | None = None
    locations: list[str] = []  # per-city array for multi-location postings (firecrawl #6)
    role_domain: str | None = None
    industry: str | None = None
    source_url: str | None = None
    first_seen: str | None = None  # ISO date derived from the feed marker
    last_seen_at: str | None = None  # ISO date the scraper last confirmed it live
    is_stale: bool = False  # last_seen older than STALE_AFTER_DAYS — warn before Apply 404
    is_active: bool = True
    skills: list[str] = []  # top main_skills display names, capped
    matched_skill_count: int = 0  # overlap with the requesting user's CV skills (0 if anon)
    target_role_match: int = 0  # how many of the user's target roles this job covers (0 if none set)


class JobFeedResponse(BaseModel):
    jobs: list[JobFeedItem]
    available_total: int
    returned_total: int
    page: int
    page_size: int
    has_next_page: bool
    sort: str  # echo of the applied sort mode


class CompanyOpenRoleItem(BaseModel):
    job_id: str
    job_title: str
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    created_at: str | None = None


class CompanyOpenRolesResponse(BaseModel):
    company: str
    jobs: list[CompanyOpenRoleItem]


class GlobalJobHit(BaseModel):
    job_id: str
    job_title: str
    company_name: str | None
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    created_at: str | None = None


class GlobalJobSearchResponse(BaseModel):
    query: str
    hits: list[GlobalJobHit]


class AnalyticsSnapshotRefreshResponse(BaseModel):
    refreshed: bool
    total_jobs: int
    total_companies: int


class MarketAnalyticsResponse(BaseModel):
    total_jobs: int
    total_companies: int
    total_industries: int
    latest_batch: str | None
    total_jobs_today: int = 0
    jobs_added_1h: int = 0
    companies_added_7d: int = 0
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
    total_jobs_today: int = 0
    jobs_added_1h: int = 0
    companies_added_7d: int = 0
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
