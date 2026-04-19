from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserProfileResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str | None
    linkedin_url: str | None
    target_roles: list[str]
    target_location: str | None
    cv_url: str | None
    cv_parsed_at: datetime | None
    onboarding_complete: bool
    created_at: datetime
    last_active_at: datetime


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
