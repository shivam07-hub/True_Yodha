from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserProfileResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str | None
    linkedin_url: str | None
    target_roles: list[str]
    target_location: str | None
    target_locations: list[str] = []
    deal_breakers: list[str] = []
    career_goal: str | None = None
    superpower: str | None = None
    cv_url: str | None
    onboarding_complete: bool
    created_at: datetime
    last_active_at: datetime
    ninja_name: str | None = None
    referred_by_user_id: str | None = None
    has_cv: bool = False
    cv_readiness: str = "missing"  # ready | missing | processing | failed
    cv_upload_job_id: str | None = None
    cv_upload_error_code: str | None = None
    myrology_unlocked: bool = False
    myrology_interested: bool = False


class UpdateProfileResponse(UserProfileResponse):
    xp_earned: int = 0
    new_xp_balance: int | None = None


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    linkedin_url: str | None = None
    target_roles: list[str] | None = None
    target_location: str | None = None
    target_locations: list[str] | None = None
    deal_breakers: list[str] | None = None
    career_goal: str | None = None
    superpower: str | None = None
    myrology_interested: bool | None = None


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


