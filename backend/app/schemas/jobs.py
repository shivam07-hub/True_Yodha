from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

# Single source of type truth for the matcher's seniority verdict. Declared once
# here and reused by the matcher's Credibility output, the MatchEval read model,
# and JobMatchResponse — so the write side and read side can never disagree about
# the field's type again (the bool/str drift that 500'd the dashboard).
SeniorityCompat = Literal["compatible", "incompatible", "unknown"]

# Single source of type truth for the Match Verdict — "how good is this match for
# this user, and what should they do about it" — computed once, read identically by
# every surface (card number, next-step best-job, /market rail) and by ordering.
# strong    → a credible recommendation worth tailoring + applying to now
# worth_it  → a decent match; apply, but not the headline pick
# stretch   → closest real jobs the user is early for; honest, paired with the moves
#             that would lift them to strong (never a dead empty state)
# checking  → provisional: the async brain hasn't run yet, number is overlap-only
MatchVerdict = Literal["strong", "worth_it", "stretch", "checking"]

# Thresholds on the brain's 0–5 overall_score (see MatchEval.match_score/verdict).
# The overlap floor is the hard guarantee behind "cannot read strong with 2/8
# skills even if the brain is generous" — the number is the brain's holistic view,
# the verdict word is gated by real skill coverage.
_VERDICT_STRONG_MIN = 3.5
_VERDICT_WORTH_MIN = 3.0
_VERDICT_STRONG_OVERLAP_FLOOR = 40.0
_STRONG_RECOMMENDATIONS = frozenset({"apply", "negotiate"})


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
    # Scoped Skill Demand — active jobs needing this skill in the user's location
    # scope. Populated only when the demand endpoint is called with
    # location_scoped=true (the market rail); null on the market-wide responses.
    scoped_job_count: int | None = None


class UserSkillDemandResponse(BaseModel):
    skills: list[UserSkillDemandItem]
    total: int


class MatchEval(BaseModel):
    """Typed view of the `user_job_matches` eval columns — the matcher's output
    (deterministic overlap + credibility + the LLM 5-axis eval).

    This is the read seam for a persisted match row: the repository parses raw
    Supabase dicts into this model, so `to_job_match` receives a typed, validated
    shape instead of re-guessing each field's type with `.get()`. Tolerant by
    design — every field optional, unknown columns ignored — so a new persisted
    column never 500s the read; a *type* mismatch on a known field fails here, at
    one clear seam, with a test surface, rather than at the per-user response gate.
    """

    model_config = ConfigDict(extra="ignore")

    overlap_score: float = 0
    llm_rank: int | None = None
    llm_explanation: str | None = None
    matched_skills: list[str] = []
    missing_skills: list[str] = []  # required skills the user lacks (T3-1 gap chips)
    is_recommended: bool = False
    baseline_version_id: int | None = None
    target_context_hash: str | None = None
    seniority_compatibility: SeniorityCompat | None = None
    overall_score: float | None = None
    grade: str | None = None
    recommendation: str | None = None
    application_angle: str | None = None
    summary: str | None = None
    role_fit: float | None = None
    comp_fit: float | None = None
    growth_fit: float | None = None
    culture_fit: float | None = None
    risk_score: float | None = None
    strengths: list[str] = []
    concerns: list[str] = []
    archetype: str | None = None
    legitimacy_tier: str | None = None      # high_confidence | caution | suspicious
    legitimacy_reason: str | None = None
    # Career Ops strategy block (6-block eval) — per-candidate positioning
    level_strategy: str | None = None       # level fit + how to play it
    personalization: str | None = None      # how THIS candidate tailors their application
    star_pointers: list[str] = []           # the candidate's own STAR stories to cite (no-fab)

    # ── Match Verdict ─────────────────────────────────────────────────────────
    # The whole "how good is this, what should they do" decision, behind three
    # tiny reads. Callers (to_job_match, ordering, every frontend surface via the
    # response) never re-derive it — this is the single place the fusion lives.
    @property
    def match_score(self) -> int:
        """The ONE fit number, 0–100. The brain's holistic overall_score (0–5) is
        the spine — so a job with high raw skill overlap but a weak brain eval
        reads *low*, fixing the old '82% shouts but it's a bad match'. Before the
        brain runs (overall_score is None) the number is overlap-only, provisional
        (verdict == 'checking'), and upgrades in place when the brain lands."""
        if self.overall_score is None:
            return round(max(0.0, min(100.0, self.overlap_score)))
        return round(max(0.0, min(100.0, self.overall_score / 5.0 * 100.0)))

    @property
    def verdict(self) -> MatchVerdict:
        """The verdict word. 'strong' is gated by the credibility signals AND a
        real skill-overlap floor — the number can be generous, the word cannot.

        'strong' is earned by the eval itself (the brain says apply, the seniority
        is compatible, real overlap) — NOT by `is_recommended`. That flag only marks
        the weekly top-3 promotion; tying 'strong' to it would mean the market feed
        (whose warmed picks persist is_recommended=False so they don't flood the
        dashboard) could never show a genuine strong match. The four floors below
        keep 'strong' rare on their own."""
        if self.overall_score is None:
            return "checking"
        rec = (self.recommendation or "").strip().lower()
        if (
            self.overall_score >= _VERDICT_STRONG_MIN
            and rec in _STRONG_RECOMMENDATIONS
            and self.seniority_compatibility == "compatible"
            and self.overlap_score >= _VERDICT_STRONG_OVERLAP_FLOOR
        ):
            return "strong"
        if (
            self.overall_score >= _VERDICT_WORTH_MIN
            and self.seniority_compatibility != "incompatible"
        ):
            return "worth_it"
        return "stretch"

    @property
    def is_strong(self) -> bool:
        """Replaces the frontend `isCredibleRecommendation` filter — the one
        boolean a surface reads to ask 'is this a headline-worthy match?'."""
        return self.verdict == "strong"


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
    # Match Verdict — the single "how good / what to do" decision every surface
    # reads. Derived server-side from the eval (see MatchEval), never in the client.
    match_score: int = 0                # 0–100 — THE fit number (brain-spined, overlap-gated)
    verdict: MatchVerdict = "checking"  # strong | worth_it | stretch | checking
    is_strong: bool = False             # verdict == strong (was frontend isCredibleRecommendation)
    llm_rank: int | None                # rank within this week's batch
    llm_explanation: str | None         # back-compat: mirrors `summary`
    batch_week: date                    # Monday this match was generated
    source_url: str | None
    matched_skills: list[str] = []
    missing_skills: list[str] = []    # required skills the user lacks (T3-1 gap chips)
    job_summary: str | None = None    # LLM-enriched ≤100-word clean prose (card body)
    job_description: str | None = None
    # Scraper structured chip columns (backlog #22) — NULL when a provider omits them
    date_posted: str | None = None
    seniority_level: str | None = None
    work_mode: str | None = None
    min_years_experience: int | None = None
    max_years_experience: int | None = None
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
    archetype: str | None = None                 # Career Ops Block A — role archetype
    legitimacy_tier: str | None = None           # Block G — high_confidence|caution|suspicious
    legitimacy_reason: str | None = None
    level_strategy: str | None = None            # 6-block — level fit + how to play it
    personalization: str | None = None           # 6-block — per-candidate application tailoring
    star_pointers: list[str] = []                # 6-block — candidate's own STAR stories to cite
    is_recommended: bool = False
    baseline_version_id: int | None = None
    target_context_hash: str | None = None
    seniority_compatibility: SeniorityCompat | None = None  # reuses the shared alias — cannot drift from MatchEval


class JobMatchesResponse(BaseModel):
    jobs: list[JobMatchResponse]
    batch_week: date        # Monday of the current week's batch
    total: int
    feed_updated_at: datetime | None = None    # MAX(jobs.last_seen) — when the feed last refreshed
    matches_computed_at: datetime | None = None  # when this user's matches were last computed
    new_jobs_count: int = 0  # genuinely-new live jobs (first_seen) inserted since this user last matched
    dismissed_job_ids: list[str] = []
    # Career-Ops vetting health (trust surface): vetted | overlap_only | computing
    # | failed | empty. overlap_only/failed drive the honest "not AI-vetted — retry"
    # banner. vetted_count/total let the UI flag exactly which cards are un-vetted.
    match_health: str = "empty"
    match_vetted_count: int = 0


class MatchRetryResponse(BaseModel):
    """Ack for the FREE re-vet after a failed / un-vetted match run."""
    accepted: bool
    match_health: str  # the health that justified (or refused) the retry


APPLICATION_STAGES = {"saved", "applied", "interviewing"}
APPLICATION_OUTCOMES = {"ghosted", "rejected", "offer"}
APPLICATION_STATUSES = APPLICATION_STAGES | APPLICATION_OUTCOMES


class ApplicationStatusUpdate(BaseModel):
    status: str     # saved | applied | interviewing | ghosted | rejected | offer
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


class PostingNoteItem(BaseModel):
    """A public note left on one of this company's job postings, rolled up to
    the company page. author_ninja_name is None when the author has no profile."""
    job_id: str
    role: str | None
    body: str
    author_ninja_name: str | None
    created_at: datetime


class CompanyPageResponse(BaseModel):
    company_name: str
    avg_star_rating: float | None
    review_count: int
    ghost_rate: float | None        # 0.0–1.0, None if no reviews
    stage_breakdown: dict[str, int]  # last_stage → count
    reviews: list[CompanyReviewItem]
    posting_notes: list[PostingNoteItem] = []
    posting_note_count: int = 0


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
    new_coin_balance: int
    matches_written: int | None = None


class RefreshPreflightResponse(BaseModel):
    """GET /jobs/refresh/preflight — the Targeting Brief's manifest for the
    pre-flight modal. Empty fields arrive gap-filled from user_memory
    (`prefilled` names each memory-sourced field); persistence still happens
    only through the user's Run/Save action."""
    role_titles: list[str]
    location: str | None = None
    deal_breakers: list[str]
    career_goal: str | None = None
    superpower: str | None = None
    prefilled: dict[str, str]
    memory_count: int


class RefreshStateResponse(BaseModel):
    """GET /jobs/refresh/{ticket_id} — polled by frontend every ~1s."""
    ticket_id: str
    state: Literal["queued", "computing", "done", "failed"]
    progress_label: str
    batch_week: date
    matches_written: int | None = None
    refund: int | None = None
    new_coin_balance: int | None = None
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
    # First-class card data: a tracked job (incl. extension-added) renders the
    # SAME FeedCard as a Myro match. These project the joined `jobs` row + the
    # CV-vs-job skill split so the dashboard card shows chips/location/meta
    # instead of an empty body. Populated by the list endpoint; default-empty
    # elsewhere (import/status responses don't drive the card — the list refetch does).
    skills: list[str] = []
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    location: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    locations: list[str] = []
    job_summary: str | None = None
    source_url: str | None = None
    date_posted: str | None = None
    seniority_level: str | None = None
    work_mode: str | None = None
    min_years_experience: int | None = None
    max_years_experience: int | None = None
    coins_earned: int | None = None                    # +XP granted on this add (transient — only set by POST /import)
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
    # Hybrid extraction backstop (extension): the client flags a weakly-sourced
    # field and forwards the page's JSON-LD so the server can fill/validate.
    needs_backstop: bool = False
    json_ld: dict[str, Any] | None = None


class JobImportPreviewResponse(BaseModel):
    role_name: str
    company_name: str | None = None
    location: str | None = None
    job_description: str
    primary_skills: list[SkillSuggestion]
    secondary_skills: list[SkillSuggestion]
    emerging_skills: list[SkillSuggestion]
    warnings: list[str] = []
    # Extension scored hook (#34 S5). Deterministic fit of the previewed job's
    # skills against the caller's CV, so the popup can show "Ready N/100 + your
    # top gaps" without persisting the job. null when no taxonomy skills resolved.
    readiness_pct: float | None = None
    matched_skills: list[str] = []
    top_gaps: list[str] = []


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


class JobImportedDetailsUpdate(BaseModel):
    """User correction of a mis-parsed imported job's role/company."""
    title: str | None = None
    company: str | None = None


class JobImportedDetailsResponse(BaseModel):
    job_id: str
    job_title: str
    company: str | None = None


class JobUrlExtractRequest(BaseModel):
    """A public posting URL to fetch and parse into tracker fields."""
    url: str


class JobFileExtractResponse(BaseModel):
    """Fields lifted from an uploaded job posting (PDF / DOCX / image / URL)."""
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
    career_band: str | None = None
    seniority_level: str | None = None
    min_years_experience: int | None = None
    max_years_experience: int | None = None
    industry: str | None = None
    source_url: str | None = None
    first_seen: str | None = None  # ISO date derived from the feed marker
    last_seen_at: str | None = None  # ISO date the scraper last confirmed it live
    is_stale: bool = False  # last_seen older than STALE_AFTER_DAYS — warn before Apply 404
    is_active: bool = True
    skills: list[str] = []  # top main_skills display names, capped
    matched_skills: list[str] = []  # which of the requesting user's CV skills this job needs (T3-1)
    matched_skill_count: int = 0  # overlap with the requesting user's CV skills (0 if anon)
    target_role_match: int = 0  # how many of the user's target roles this job covers (0 if none set)
    # Matching-Brain badges from the cached eval (Consolidation D). Present only
    # when the brain already ran on this job for this user (prior refresh / open);
    # absent = deterministic overlap only, no LLM call at read time.
    overall_score: float | None = None
    grade: str | None = None
    recommendation: str | None = None
    legitimacy_tier: str | None = None
    legitimacy_reason: str | None = None
    archetype: str | None = None
    # Match Verdict — the single "how good / what to do" decision (see MatchEval),
    # derived server-side, never in the client. Set only when the brain has ranked
    # this card; a card with no verdict is an un-warmed browse row.
    match_score: int | None = None      # 0–100 — brain-spined fit number
    verdict: MatchVerdict | None = None  # strong | worth_it | stretch (None = un-warmed)
    is_strong: bool = False


class JobFeedResponse(BaseModel):
    jobs: list[JobFeedItem]
    available_total: int
    returned_total: int
    page: int
    page_size: int
    has_next_page: bool
    sort: str  # echo of the applied sort mode
    expansion_tier: Literal["exact", "remote_country", "country"] = "exact"
    expansion_label: str | None = None
    # How many leading cards the brain has ranked (carry a verdict). The feed draws
    # the "more roles" divider after this many; 0 = no ranked shortlist yet.
    ranked_count: int = 0


class AgentPickItem(JobFeedItem):
    """One card in the "Myro Agent Picks" band — a normal feed card plus the
    Career-Ops brain's rank + why-it-fits note (migration 20260709). The editorial
    layer: hand-vetted and walled off from the algorithm feed below."""

    agent_rank: int
    agent_tier: str | None = None  # 'bullseye' | 'strong' | 'reach'
    agent_comment: str = ""        # the brain's why-it-fits, shown on the card


class AgentPicksResponse(BaseModel):
    picks: list[AgentPickItem]
    total: int = 0


class FeedWarmResponse(BaseModel):
    """Result of POST /jobs/feed/warm — the brain ranked the feed's top shortlist.

    `ready` is always True once the call returns (the feed is safe to paint); it is
    True even when `warmed` is 0 (everything was already cached, or the brain was
    unavailable and the feed falls back to deterministic order — degradation, not an
    error). `warmed` = how many NEW evals were computed this call."""

    ready: bool = True
    warmed: int = 0


class MatchBrainResult(BaseModel):
    """On-demand single-job brain eval (Consolidation D). Returned by
    POST /jobs/{job_id}/brain; the frontend patches these onto its local job.
    `cached=True` means it was already computed (no LLM ran this call)."""

    job_id: str
    cached: bool = False
    available: bool = True  # False when the brain couldn't run (provider down / job gone)
    overall_score: float | None = None
    grade: str | None = None
    recommendation: str | None = None
    summary: str | None = None
    application_angle: str | None = None
    role_fit: float | None = None
    comp_fit: float | None = None
    growth_fit: float | None = None
    culture_fit: float | None = None
    risk_score: float | None = None
    strengths: list[str] = []
    concerns: list[str] = []
    archetype: str | None = None
    legitimacy_tier: str | None = None
    legitimacy_reason: str | None = None


class HiddenJobItem(BaseModel):
    job_id: str
    job_title: str
    company_name: str | None = None
    location: str | None = None
    dismissed_at: datetime | None = None


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


class CompanyHiringItem(BaseModel):
    company_name: str
    open_count: int
    location_country: str | None = None
    last_seen_at: str | None = None


class TopCompaniesAtResponse(BaseModel):
    kind: str  # "industry" | "city"
    value: str
    companies: list[CompanyHiringItem]


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
    scraper_started: str | None = None
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
    scraper_started: str | None = None
    total_jobs_today: int = 0
    jobs_added_1h: int = 0
    companies_added_7d: int = 0
    by_company: list[NameCountItem]
    by_industry: list[NameCountItem]
    by_role: list[NameCountItem] = []
    by_location_city: list[NameCountItem] = []
    by_location_country: list[NameCountItem] = []
    by_location_mode: list[NameCountItem] = []
    # Market-wide top skills by active-job count (universal, same for every user
    # — powers the /market rail's "Skill-demand movers"). Location-filterable via
    # the same query params as the rest of this summary.
    top_skills: list[SkillCountItem] = []


class EntitySkillsResponse(BaseModel):
    entity: str
    type: str
    skills: list[SkillCountItem]



class SkillHeatmapResponse(BaseModel):
    matrix: dict[str, dict[str, int]]  # company_name -> skill_display_name -> job_count
