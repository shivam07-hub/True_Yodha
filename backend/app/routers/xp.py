from fastapi import APIRouter, Depends, status

from app.deps import Principal, get_principal
from app.schemas.xp import (
    ForgeCompleteRequest,
    ForgeSessionDatesResponse,
    ForgeSessionResponse,
    LastForgedSkillResponse,
    XPBalanceResponse,
    XPSpendRequest,
)
from app.services import forge_service, xp_service

router = APIRouter(prefix="/users/me", tags=["xp"])


@router.get("/xp", response_model=XPBalanceResponse)
async def get_xp_balance(
    principal: Principal = Depends(get_principal),
) -> XPBalanceResponse:
    balance = await xp_service.get_xp_balance(principal.id)
    return XPBalanceResponse(balance=balance)


@router.post("/xp/spend", response_model=XPBalanceResponse)
async def spend_xp(
    body: XPSpendRequest,
    principal: Principal = Depends(get_principal),
) -> XPBalanceResponse:
    new_balance = await xp_service.spend_xp(
        user_id=principal.id,
        amount=body.amount,
        action=body.action,
    )
    return XPBalanceResponse(balance=new_balance)


@router.post("/forge/complete", response_model=ForgeSessionResponse, status_code=status.HTTP_201_CREATED)
async def complete_forge_session(
    body: ForgeCompleteRequest,
    principal: Principal = Depends(get_principal),
) -> ForgeSessionResponse:
    result = await forge_service.complete_forge_session(
        user_id=principal.id,
        skill_name=body.skill_name,
        skill_id=body.skill_id,
        duration_minutes=body.duration_minutes,
        session_type=body.session_type,
    )
    return ForgeSessionResponse(**result)


@router.get("/forge/last-skill", response_model=LastForgedSkillResponse)
async def last_forged_skill(
    principal: Principal = Depends(get_principal),
) -> LastForgedSkillResponse:
    """Return the most recently forged skill. Empty fields when user has none yet."""
    row = forge_service.get_last_forged_skill(principal.id)
    if not row:
        return LastForgedSkillResponse(skill_id=None, skill_name=None)
    return LastForgedSkillResponse(**row)


@router.get("/forge/sessions", response_model=ForgeSessionDatesResponse)
async def forge_session_dates(
    principal: Principal = Depends(get_principal),
) -> ForgeSessionDatesResponse:
    """Recent forge-session completion timestamps — powers the home practice streak."""
    return ForgeSessionDatesResponse(dates=forge_service.list_recent_session_dates(principal.id))
