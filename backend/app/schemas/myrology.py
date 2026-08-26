from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

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


class OrderResponse(BaseModel):
    """Delivery state of the one-time Myrology purchase.

    `paid_at` is the verified payment moment from `billing_payments`, not the
    intake save — a native who edits their birth details a week later must not
    reset their own delivery promise. `promised_by` is derived from it here so
    the date the page shows and the date the astrologer works to are the same
    calculation.
    """

    paid_at: datetime
    promised_by: date
    working_days: int


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
    confirmed_at: datetime | None = None
    done_at: datetime | None = None
    cancelled_at: datetime | None = None


class BookingListResponse(BaseModel):
    bookings: list[BookingResponse]


class BookingStatusUpdate(BaseModel):
    """Internal/ops transition of a booking through its lifecycle. 'requested'
    is the insert default and is never a valid target."""

    status: Literal["confirmed", "done", "cancelled"]
