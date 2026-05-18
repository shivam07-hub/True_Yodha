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

    @field_validator("level")
    @classmethod
    def level_in_range(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("Level must be between 1 and 5")
        return v


class SkillLevelCorrectionResponse(BaseModel):
    taxonomy_key: str
    new_level: int
    total_score: float | None


class SkillAdviceRequest(BaseModel):
    taxonomy_key: str
    current_level: int
    evidence_text: str


class SkillAdviceResponse(BaseModel):
    advice: str | None
    xp_spent: int
    new_xp_balance: int
