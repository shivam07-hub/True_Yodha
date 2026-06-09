"""Upskilling router (PRD §7) — Surface A: ladder list, serve set, grade+award.

Surface B (gap calibration) endpoints land in Slice 5 with their entry points.
All routes are token-scoped via get_principal. The served-set responses never
carry the answer key — grading is server-only in /sets/{id}/submit.
"""

from fastapi import APIRouter, Depends

from app.deps import Principal, get_principal
from app.schemas.upskilling import (
    StartSetRequest,
    StartSetResponse,
    SubmitSetRequest,
    SubmitSetResponse,
    UpskillingSkill,
)
from app.services import upskilling_service

router = APIRouter(prefix="/upskilling", tags=["upskilling"])


@router.get("/skills", response_model=list[UpskillingSkill])
def list_skills(
    principal: Principal = Depends(get_principal),
) -> list[UpskillingSkill]:
    rows = upskilling_service.list_skills(principal.id)
    return [UpskillingSkill(**r) for r in rows]


@router.post("/sets", response_model=StartSetResponse)
def start_set(
    body: StartSetRequest,
    principal: Principal = Depends(get_principal),
) -> StartSetResponse:
    result = upskilling_service.start_set(principal.id, body.skill_id, body.level)
    return StartSetResponse(**result)


@router.post("/sets/{set_id}/submit", response_model=SubmitSetResponse)
async def submit_set(
    set_id: str,
    body: SubmitSetRequest,
    principal: Principal = Depends(get_principal),
) -> SubmitSetResponse:
    result = await upskilling_service.submit_set(
        user_id=principal.id,
        set_id=set_id,
        answers=[a.model_dump() for a in body.answers],
        idempotency_key=body.idempotency_key,
    )
    return SubmitSetResponse(**result)
