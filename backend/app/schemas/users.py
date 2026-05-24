from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


class UserProfileResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str | None
    linkedin_url: str | None
    target_roles: list[str]
    target_location: str | None
    cv_url: str | None
    onboarding_complete: bool
    created_at: datetime
    last_active_at: datetime
    ninja_name: str | None = None
    referred_by_user_id: str | None = None
    has_cv: bool = False


class UpdateProfileResponse(UserProfileResponse):
    xp_earned: int = 0
    new_xp_balance: int | None = None


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    linkedin_url: str | None = None
    target_roles: list[str] | None = None
    target_location: str | None = None


class UserSkillItem(BaseModel):
    key: str
    display_name: str
    level: int
    proficiency_title: str
    evidence_text: str | None = None
    forge_sessions_count: int = 0
    forged_level_up_available: bool = False
    correction_count: int = 0


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


class SkillLevelCorrectionRequest(BaseModel):
    level: int
    bullet_text: str  # Bullet proving the claimed level — required for appeal flow.

    @field_validator("level")
    @classmethod
    def level_in_range(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("Level must be between 1 and 5")
        return v


class SkillLevelCorrectionResponse(BaseModel):
    taxonomy_key: str
    new_level: int | None          # None when appeal is rejected
    total_score: float | None
    approved: bool
    verdict: str                   # LLM one-line reason
    criteria: str                  # LLM one-line bar description
    appeals_remaining: int         # 0 = locked out


class SkillAdviceRequest(BaseModel):
    taxonomy_key: str
    current_level: int
    evidence_text: str
    free_unlock: bool = False


class SkillAdviceResponse(BaseModel):
    advice: str | None
    xp_spent: int
    new_xp_balance: int
