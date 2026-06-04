from typing import Literal

from pydantic import BaseModel, Field


class XPBalanceResponse(BaseModel):
    balance: int


class XPSpendRequest(BaseModel):
    amount: int = Field(gt=0)
    action: str = Field(min_length=1)


class ForgeCompleteRequest(BaseModel):
    skill_name: str = Field(min_length=1)
    skill_id: str | None = None
    # One burst's minutes since the last claim. Continuation model: bursts accrue
    # across the day, so the ceiling is a full day, not a single 3h block. Mirror
    # of FORGE_MAX_BURST_MINUTES in frontend/store/forgeTimerStore.ts.
    duration_minutes: int = Field(default=25, ge=1, le=1440)
    session_type: Literal["ambient", "focused"] = "focused"


class ForgeSessionResponse(BaseModel):
    xp_earned: int
    new_xp_balance: int
    level_before: int
    level_after: int
    leveled_up: bool
    sessions_toward_next: int
    sessions_needed: int | None
    total_forge_minutes: int = 0
    minutes_to_next_session: int = 25


class LastForgedSkillResponse(BaseModel):
    skill_id: str | None
    skill_name: str | None


class ForgeSessionDatesResponse(BaseModel):
    dates: list[str]
