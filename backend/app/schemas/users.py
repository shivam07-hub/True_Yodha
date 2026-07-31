from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr


CareerBand = Literal[
    "engineering_data",
    "business_product_operations",
    "research_people_public_impact",
    "design_creative",
]


class UserProfileResponse(BaseModel):
    email: EmailStr
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
    cv_readiness: str = "missing"  # ready | missing | processing | failed
    cv_upload_job_id: str | None = None
    cv_upload_error_code: str | None = None
    myrology_unlocked: bool = False
    myrology_interested: bool = False
    accent_pref: Literal["signal", "forge"] = "signal"


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
    career_goal: str | None = None
    superpower: str | None = None
    myrology_interested: bool | None = None
    accent_pref: Literal["signal", "forge"] | None = None


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
