"""Schemas for public profile page (/profile/{ninja_name})."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class PublicProfile(BaseModel):
    """Public read surface for /profile/{ninja_name}. PII-free.

    Sourced from public_profile_v view. Email, full_name, linkedin_url, and
    raw skill names MUST NEVER appear here.
    """

    ninja_name: str
    mirror_score: float | None = None
    domain_scores: dict[str, float] | None = None
    tier_label: str | None = None
    forge_sessions_count: int = 0
    diary_count: int = 0
    tracker_count: int = 0


class JobOverlapRow(BaseModel):
    """One job both viewer + profile owner have saved (logged-in-only)."""

    job_id: str
    role: str | None = None
    company_name: str | None = None
    viewer_match_pct: float | None = None
    owner_match_pct: float | None = None
    viewer_status: str | None = None
    owner_status: str | None = None


class JobOverlapResponse(BaseModel):
    rows: list[JobOverlapRow] = Field(default_factory=list)


class UpdateNinjaNameRequest(BaseModel):
    ninja_name: str

    @field_validator("ninja_name")
    @classmethod
    def normalize(cls, v: str) -> str:
        return v.strip().lower()


class UpdateNinjaNameResponse(BaseModel):
    ninja_name: str


class SuggestNinjaNameResponse(BaseModel):
    """Used during onboarding to seed the input with an available default."""

    ninja_name: str
