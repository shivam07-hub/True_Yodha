from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, Field, field_validator


class IntakeRequest(BaseModel):
    dob: date
    birth_time: time | None = None
    birth_time_unknown: bool = False
    birth_place: str = Field(min_length=1, max_length=200)
    guidance_note: str | None = Field(default=None, max_length=2000)

    @field_validator("birth_place")
    @classmethod
    def _strip_place(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("birth_place is required")
        return cleaned


class IntakeResponse(BaseModel):
    dob: date
    birth_time: time | None = None
    birth_time_unknown: bool = False
    birth_place: str
    guidance_note: str | None = None
    updated_at: datetime


class BookingRequest(BaseModel):
    preferred_windows: str = Field(min_length=1, max_length=500)
    topic: str | None = Field(default=None, max_length=500)

    @field_validator("preferred_windows")
    @classmethod
    def _strip_windows(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("preferred_windows is required")
        return cleaned


class BookingResponse(BaseModel):
    id: str
    preferred_windows: str
    topic: str | None = None
    status: str
    created_at: datetime


class BookingListResponse(BaseModel):
    bookings: list[BookingResponse]
