from datetime import date, datetime
from pydantic import BaseModel, field_validator


class CartSkillSnapshot(BaseModel):
    skill_name: str
    level_from: int = 0
    level_to: int = 0
    company: str | None = None


class DiaryEntryRequest(BaseModel):
    entry_text: str
    log_date: date | None = None
    cart_skills: list[CartSkillSnapshot] = []

    @field_validator("entry_text")
    @classmethod
    def entry_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Diary entry cannot be empty")
        return v.strip()


class SkillDeltaItem(BaseModel):
    taxonomy_key: str
    xp_added: int
    evidence: str       # excerpt from entry_text that triggered this signal


class DiaryEntryResponse(BaseModel):
    id: str
    log_date: date
    entry_text: str
    skills_delta: list[SkillDeltaItem]
    score_before: float | None
    score_after: float | None
    coins_earned: int = 0
    new_coin_balance: int | None = None
    created_at: datetime
    updated_at: datetime


class DiaryHistoryResponse(BaseModel):
    entries: list[DiaryEntryResponse]
    total: int


class MilestoneRequest(BaseModel):
    milestone_date: date
    skill: str | None = None
    task: str
    proof: str | None = None
    impact: str | None = None
    confidence: float = 0.6
    completed: bool = False

    @field_validator("task")
    @classmethod
    def task_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Milestone task cannot be empty")
        return v.strip()

    @field_validator("confidence")
    @classmethod
    def confidence_in_range(cls, v: float) -> float:
        if v < 0 or v > 1:
            raise ValueError("Confidence must be between 0 and 1")
        return v


class MilestoneResponse(BaseModel):
    id: str
    job_id: str | None = None
    milestone_date: date
    skill: str | None
    task: str
    proof: str | None
    impact: str | None
    confidence: float
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    source_type: str = "personal"  # 'personal' | 'job'


class MilestoneListResponse(BaseModel):
    milestones: list[MilestoneResponse]
    total: int
