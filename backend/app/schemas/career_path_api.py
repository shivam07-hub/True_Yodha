from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.career_skill_path import CertificateStatus, DemandKind, SkillState

SourceSeniority = Literal["intern", "entry", "mid", "senior", "lead", "executive"]
BandKind = Literal["lower", "anchor", "higher"]


class CareerTargetSnapshotOut(BaseModel):
    id: str
    role_title: str
    career_area: str | None = None
    role_family: str
    role_family_label: str | None = None
    seniority: SourceSeniority
    locations: list[str] = Field(default_factory=list)
    cv_baseline_id: int | None = None
    created_at: str | None = None


class DemandMeter(BaseModel):
    kind: DemandKind
    skill_job_count: int
    band_job_count: int


class SkillPathCard(BaseModel):
    skill_id: int | None = None
    taxonomy_key: str
    display_name: str
    state: SkillState
    current_level: int | None = None
    required_level: int | None = None
    evidence_pointer: str | None = None
    demand: DemandMeter | None = None
    ladder_complete: bool = False
    certificate_status: CertificateStatus = "none"
    verification_id: str | None = None
    next_practice_level: int | None = None
    request_status: Literal["none", "recorded", "fulfilled"] = "none"


class BandSkillMap(BaseModel):
    kind: BandKind
    seniority: SourceSeniority
    job_count: int | None = None
    cards: list[SkillPathCard] = Field(default_factory=list)


class SkillPathNextAction(BaseModel):
    kind: str
    label: str
    taxonomy_key: str | None = None
    skill_id: int | None = None
    level: int | None = None
    verification_id: str | None = None


class CareerSkillPathResponse(BaseModel):
    needs_target: bool
    snapshot: CareerTargetSnapshotOut | None = None
    lower: BandSkillMap | None = None
    anchor: BandSkillMap | None = None
    higher: BandSkillMap | None = None
    next_action: SkillPathNextAction | None = None
    target_flow: dict[str, Any] | None = None


class LearningPathRequestBody(BaseModel):
    taxonomy_key: str = Field(min_length=1, max_length=200)


class LearningPathRequestResponse(BaseModel):
    taxonomy_key: str
    status: Literal["recorded", "already_recorded"]
    message: str


class SkillCertificatePublic(BaseModel):
    skill_display_name: str
    achieved_level: int
    passed_at: str
    verification_id: str
    assessment_edition: str


class SkillCertificateIssued(BaseModel):
    id: str
    skill_display_name: str
    achieved_level: int
    passed_at: str
    verification_id: str
    assessment_edition: str
    attempt_id: str
    verify_path: str
    cv_line: str
    certificate_status: CertificateStatus = "issued"
