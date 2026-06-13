from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.services.job_intelligence_policy import (
    PERSONAL_FEEDBACK_REASONS,
    QUALITY_FEEDBACK_REASONS,
)


class FeedStateResponse(BaseModel):
    feed_version: str | None
    published_at: datetime | None
    imported_job_count: int
    latest_batch_date: str | None


class JobFeedbackRequest(BaseModel):
    client_event_id: UUID
    job_id: str = Field(min_length=1, max_length=200)
    feedback_kind: Literal["personal", "quality"]
    reason_code: str
    surface: Literal["dashboard", "market", "job_detail", "other"]

    @model_validator(mode="after")
    def validate_reason_taxonomy(self) -> "JobFeedbackRequest":
        reasons = (
            PERSONAL_FEEDBACK_REASONS
            if self.feedback_kind == "personal"
            else QUALITY_FEEDBACK_REASONS
        )
        if self.reason_code not in reasons:
            raise ValueError(
                f"{self.reason_code!r} is not valid for {self.feedback_kind!r}"
            )
        return self


class JobFeedbackResponse(BaseModel):
    event_id: int
    client_event_id: UUID
    job_id: str
    feedback_kind: Literal["personal", "quality"]
    reason_code: str
    surface: str
    created_at: datetime
    created: bool


class JobPulsesRequest(BaseModel):
    job_ids: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "JobPulsesRequest":
        if len(set(self.job_ids)) != len(self.job_ids):
            raise ValueError("job_ids must be unique")
        if any(not job_id.strip() for job_id in self.job_ids):
            raise ValueError("job_ids cannot contain blanks")
        return self


class JobPulseResponse(BaseModel):
    job_id: str
    first_seen_at: str | None
    last_verified_at: str | None
    is_stale: bool
    listing_confidence: Literal[
        "active",
        "uncertain",
        "likely_closed",
        "closed",
    ]
    tracking_count: int | None
    outcomes_shared: int | None
    ghosted_count: int | None
    response_signal: Literal["low", "mixed", "high"] | None
    quality_report_count: int | None


class JobPulsesResponse(BaseModel):
    pulses: list[JobPulseResponse]
