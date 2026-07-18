"""Schemas for the Career Profile store (the recruiter/logistics fact-layer).

`CareerProfile` IS the typed contract the `career_profile.data` jsonb column holds
— the extension auto-fill (P2) and the just-in-time mini-form (S2) both read/write
this shape. Every field is Optional: capture is progressive (grill lock L1), so a
profile is valid at any degree of completeness.

Keys are deliberately typed for the fields the extension fills into forms —
`notice_period_days`, `current_ctc_fixed_lpa`, `expected_ctc_lpa` are numeric so
the fill writes a clean value, not parsed prose (grill lock L8).
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CareerProfile(BaseModel):
    """The recruiter fact-layer. All optional — progressive capture."""

    model_config = ConfigDict(extra="ignore")

    # Experience splits (pre-fillable from the reservoir → confirm-not-type).
    total_experience_years: float | None = Field(default=None, ge=0, le=60)
    bd_experience_years: float | None = Field(default=None, ge=0, le=60)
    it_services_years: float | None = Field(default=None, ge=0, le=60)
    gcc_bd_years: float | None = Field(default=None, ge=0, le=60)

    # Compensation (sensitive; user entry IS consent — no consent gate, lock L4).
    current_ctc_fixed_lpa: float | None = Field(default=None, ge=0, le=1000)
    current_ctc_variable_lpa: float | None = Field(default=None, ge=0, le=1000)
    expected_ctc_lpa: float | None = Field(default=None, ge=0, le=1000)

    # Logistics.
    notice_period_days: int | None = Field(default=None, ge=0, le=365)
    current_location: str | None = Field(default=None, max_length=200)
    open_to_relocate: bool | None = None
    interview_availability: str | None = Field(default=None, max_length=500)

    # Performance / recruiter matrix.
    sales_target: str | None = Field(default=None, max_length=500)
    target_achievement: str | None = Field(default=None, max_length=500)
    new_logos_last_year: int | None = Field(default=None, ge=0, le=100000)
    reporting_manager: str | None = Field(default=None, max_length=200)  # optional, PV1 (lock L4)
    reason_for_change: str | None = Field(default=None, max_length=1000)

    # Free-text "anything else recruiters ask?" (lock L2).
    notes: str | None = Field(default=None, max_length=2000)


class CareerProfileResponse(BaseModel):
    profile: CareerProfile
    updated_at: str | None = None
    # Fields Myro pre-filled from the reservoir the user hasn't confirmed yet —
    # the mini-form shows these as "confirm" rather than blank asks (lock L3).
    suggested: CareerProfile | None = None


class UpdateCareerProfileRequest(BaseModel):
    """PATCH semantics: only supplied keys are written; others untouched.

    A key set to null explicitly clears that fact (e.g. removing a reporting
    manager). Absent keys are left as-is — so the mini-form can save one section
    without wiping the rest.
    """

    model_config = ConfigDict(extra="ignore")

    profile: dict[str, object] = Field(default_factory=dict)
