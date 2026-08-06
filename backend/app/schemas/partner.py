"""Request/response contracts for the Partner API (`/partner/v1/*`).

These shapes are published to third parties, so they are additive-only from here
on: a partner's integration breaks on a removed field, not on a new one.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


class SsoSessionRequest(BaseModel):
    """POST /partner/v1/sso/session — hand one of your users into Myro."""

    external_id: str = Field(min_length=1, max_length=128, description="Your stable id for this user.")
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=120)


class SsoSessionResponse(BaseModel):
    mode: Literal["direct", "verification_required"]
    login_url: str | None = Field(
        default=None,
        description="One-time sign-in url. Redirect the user's BROWSER here. Null when verification is required.",
    )
    user_ref: str = Field(description="Myro's handle for this seat. Stable across calls.")
    message: str


class PartnerJob(BaseModel):
    job_id: str
    title: str
    company: str | None = None
    location: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    work_mode: str | None = None
    role_domain: str | None = None
    seniority_level: str | None = None
    min_years_experience: int | None = None
    max_years_experience: int | None = None
    skills: list[str] = []
    apply_url: str | None = None
    first_seen_at: str | None = None


class PartnerJobsResponse(BaseModel):
    external_id: str
    user_ref: str
    count: int
    jobs: list[PartnerJob]


class WebhookRequest(BaseModel):
    """PUT /partner/v1/webhook — register or replace your endpoint."""

    url: str = Field(max_length=512, description="Absolute https url we POST events to.")
    event_types: list[str] = Field(default=["job_matches.new"])


class WebhookResponse(BaseModel):
    url: str
    event_types: list[str]
    status: str
    signing_secret: str | None = Field(
        default=None,
        description="Returned ONLY when the endpoint is registered or rotated. Store it — it is not shown again.",
    )
    last_delivery_at: str | None = None
    consecutive_failures: int = 0


class WebhookDelivery(BaseModel):
    event_id: str
    event_type: str
    status: str
    attempts: int
    response_code: int | None = None
    error: str | None = None
    created_at: str | None = None
    delivered_at: str | None = None


class WebhookDeliveriesResponse(BaseModel):
    deliveries: list[WebhookDelivery]


class WebhookTestResponse(BaseModel):
    event_id: str | None
    message: str


class BroadcastRequest(BaseModel):
    """Internal — fan the current inventory out to a partner's seats."""

    partner_slug: str | None = None
    jobs_per_user: int = Field(default=10, ge=1, le=25)
    max_experience_years: int | None = Field(default=None, ge=0, le=40)
    dry_run: bool = False


class BroadcastResponse(BaseModel):
    results: dict[str, Any]
