from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator


CareerBand = Literal[
    "engineering_data",
    "business_product_operations",
    "research_people_public_impact",
    "design_creative",
]


class DirectionOut(BaseModel):
    """What this person is aiming at — the ONE answer every surface renders.

    Before this, nine places in the frontend rebuilt the target from the raw
    columns below and five of them disagreed: two fell back to `target_roles`,
    Practice stopped at `target_role_title`, `/market` read `target_roles`
    alone, and the CV page answered "needs a target?" from whether the scoping
    key was empty — so a user whose scope was blank was told to pick a target
    that their own Career Path page was showing them.

    The raw columns stay on the wire for now; this is what a surface reads.
    """

    #: Shown to humans.
    titles: list[str] = []
    #: What the matcher scopes on. Corpus families — the SAME strings as
    #: `titles` for anyone the picker wrote (CONTEXT.md §1023).
    families: list[str] = []
    primary_title: str | None = None
    #: The one answer to "does this person need a target?". Titles alone count.
    is_set: bool = False
    #: A role-targeted search will scope on something.
    is_runnable: bool = False
    #: What a search can honestly promise: targeted · skills_only · none.
    scope_mode: str = "none"


class UserProfileResponse(BaseModel):
    email: EmailStr
    #: Read this, not the raw target columns.
    direction: DirectionOut | None = None
    full_name: str | None
    linkedin_url: str | None
    target_roles: list[str]
    target_role_title: str | None = None
    target_role_titles: list[str] = []
    target_seniority: str | None = None
    target_career_band: CareerBand | None = None
    explored_career_bands: list[CareerBand] = []
    target_location: str | None
    target_locations: list[str] = []
    deal_breakers: list[str] = []
    career_goal: str | None = None
    superpower: str | None = None
    cv_url: str | None
    onboarding_complete: bool
    ninja_name: str | None = None
    has_cv: bool = False
    #: Whether the latest baseline CV has had its skills confirmed. Drives which
    #: step the re-entry nudge names.
    skills_confirmed: bool = False
    cv_readiness: str = "missing"  # ready | missing | processing | failed
    # A direction is set and no Match Run has landed for it (**Match Freshness**
    # `outstanding`). Free here — the two columns ride the profile row this
    # endpoint already reads — and it is the one place the fact costs nothing,
    # which is why /jobs/matches does not ask for it.
    match_run_outstanding: bool = False
    cv_upload_job_id: str | None = None
    cv_upload_error_code: str | None = None
    myrology_unlocked: bool = False
    myrology_interested: bool = False
    accent_pref: Literal["signal", "forge"] = "signal"
    #: Renamed CV section headings; absent key = default (`cv_section_order`).
    cv_section_titles: dict[str, str] | None = None


class UpdateProfileResponse(UserProfileResponse):
    coins_earned: int = 0
    new_coin_balance: int | None = None


class AccountDeletionResponse(BaseModel):
    deleted: bool


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    linkedin_url: str | None = None
    target_roles: list[str] | None = None
    target_role_title: str | None = None
    target_role_titles: list[str] | None = None
    target_seniority: str | None = None
    explored_career_bands: list[CareerBand] | None = None
    target_location: str | None = None
    target_locations: list[str] | None = None
    deal_breakers: list[str] | None = None
    # The other half of the direction axis. It has no column — leans live as
    # authored `preference` facts — so this is routed, not written, by the
    # update_profile handler.
    lean: list[str] | None = None
    career_goal: str | None = None
    superpower: str | None = None
    myrology_interested: bool | None = None
    accent_pref: Literal["signal", "forge"] | None = None
    #: The WHOLE map, normalised on the way in. `{}` resets every heading.
    cv_section_titles: dict[str, str] | None = None

    @field_validator("cv_section_titles")
    @classmethod
    def _normalise_titles(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        from app.services.cv_section_order import normalize_section_titles

        return None if value is None else normalize_section_titles(value)


class UserSkillItem(BaseModel):
    key: str
    display_name: str
    level: int
    proficiency_title: str
    description: str | None = None  # Lightcast definition (skills.description); null until enriched
    evidence_text: str | None = None
    forge_sessions_count: int = 0
    forged_level_up_available: bool = False


class UserSkillsByDomainResponse(BaseModel):
    by_domain: dict[str, list[UserSkillItem]]    # keyed by L1 domain (for radar drill-down)
    by_cluster: dict[str, list[UserSkillItem]]   # keyed by L2 cluster (for CV page)


class FollowCompanyRequest(BaseModel):
    company_name: str


class FollowedCompany(BaseModel):
    company_name: str
    created_at: datetime


class FollowedCompaniesResponse(BaseModel):
    companies: list[FollowedCompany]
    total: int


class SavePracticeSkillRequest(BaseModel):
    skill_key: str
    display_name: str
    source: str = "gap_session"


class PracticeSave(BaseModel):
    skill_key: str
    display_name: str
    source: str
    saved_at: datetime


class PracticeSavesResponse(BaseModel):
    skills: list[PracticeSave]
    total: int


class SkillUpvoteToggleRequest(BaseModel):
    skill_key: str
    display_name: str = ""
    job_id: str


class SkillUpvoteItem(BaseModel):
    skill_key: str
    display_name: str
    count: int
    job_ids: list[str]


class SkillUpvotesResponse(BaseModel):
    skills: list[SkillUpvoteItem]
    total: int


class SkillUpvoteToggleResponse(BaseModel):
    skill_key: str
    upvoted: bool
    count: int


class SkillCorrectionRequest(BaseModel):
    skill_key: str
    """False removes the skill from the scored set; True puts it back."""
    included: bool


class SkillCorrectionResponse(BaseModel):
    skill_key: str
    included: bool
    total_score: float
    skills_assessed: int
