from datetime import date, datetime
from pydantic import BaseModel, field_validator


class DiaryEntryRequest(BaseModel):
    entry_text: str
    log_date: date | None = None    # defaults to today if not provided

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
    skills_delta: list[SkillDeltaItem]  # skills updated from this entry
    score_before: float | None          # Mirror Score before this entry
    score_after: float | None           # Mirror Score after — shows user the delta
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
    milestone_date: date
    skill: str | None
    task: str
    proof: str | None
    impact: str | None
    confidence: float
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class MilestoneListResponse(BaseModel):
    milestones: list[MilestoneResponse]
    total: int
