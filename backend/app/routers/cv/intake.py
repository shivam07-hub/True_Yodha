"""POST /cv/intake-draft — shape the user's own experience into JD-aligned bullets.

The "Add from your experience" flow (CV Playground Option C): the user reads the
JD, writes what they've done that fits, and Mentor drafts strong bullets mapped
to the target skills + best-fit role. Stateless, free, writes nothing — the
client passes the JD / gap skills / role headers it already holds, and accepted
bullets are written through the existing PUT /cv/master (living-master autosave).

All logic lives in services/cv_intake (pure, unit-tested). No-fabrication law per
ADR-0016. Spec: memory/project_cv_endtoend_journey.md (brain-dump collecting moment).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.services import cv_intake
from app.services.llm_provider import get_interactive_provider

router = APIRouter()


class IntakeDraftRequest(BaseModel):
    raw_text:   str = Field(..., min_length=1)
    jd_text:    str | None = None
    gap_skills: list[str] = []
    roles:      list[str] = []  # role headers, e.g. "GTM Manager · Capgemini"


class IntakeBullet(BaseModel):
    text:           str
    skills_covered: list[str]
    role_index:     int | None
    needs_metric:   bool


class IntakeDraftResponse(BaseModel):
    mode:      str               # "draft" | "error"
    bullets:   list[IntakeBullet] = []
    rationale: str | None = None


@router.post("/intake-draft", response_model=IntakeDraftResponse)
async def intake_draft(
    body: IntakeDraftRequest,
    _principal: Principal = Depends(get_principal),
) -> IntakeDraftResponse:
    result = await cv_intake.draft_from_intake(
        raw_text=body.raw_text,
        jd_text=body.jd_text,
        gap_skills=body.gap_skills,
        roles=body.roles,
        provider=get_interactive_provider(),
    )
    if result["mode"] != "draft":
        return IntakeDraftResponse(mode="error", rationale=result.get("rationale"))
    return IntakeDraftResponse(
        mode="draft",
        bullets=[IntakeBullet(**b) for b in result["bullets"]],
    )


class PlaceMetricRequest(BaseModel):
    bullet: str = Field(..., min_length=1)
    metric: str = Field(..., min_length=1)  # the REAL number the user supplied


class PlaceMetricResponse(BaseModel):
    text: str  # bullet with the user's number woven in (or unchanged on failure)


@router.post("/intake-place-metric", response_model=PlaceMetricResponse)
async def intake_place_metric(
    body: PlaceMetricRequest,
    _principal: Principal = Depends(get_principal),
) -> PlaceMetricResponse:
    result = await cv_intake.place_metric(body.bullet, body.metric, get_interactive_provider())
    return PlaceMetricResponse(text=result["text"])
