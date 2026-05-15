from fastapi import APIRouter, Depends, status

from app.deps import get_current_user
from app.schemas.xp import ForgeCompleteRequest, ForgeSessionResponse, XPBalanceResponse, XPSpendRequest
from app.services import forge_service, xp_service

router = APIRouter(prefix="/users/me", tags=["xp"])


@router.get("/xp", response_model=XPBalanceResponse)
async def get_xp_balance(
    current_user: dict = Depends(get_current_user),
) -> XPBalanceResponse:
    balance = await xp_service.get_xp_balance(current_user["user_id"])
    return XPBalanceResponse(balance=balance)


@router.post("/xp/spend", response_model=XPBalanceResponse)
async def spend_xp(
    body: XPSpendRequest,
    current_user: dict = Depends(get_current_user),
) -> XPBalanceResponse:
    new_balance = await xp_service.spend_xp(
        user_id=current_user["user_id"],
        amount=body.amount,
        action=body.action,
    )
    return XPBalanceResponse(balance=new_balance)


@router.post("/forge/complete", response_model=ForgeSessionResponse, status_code=status.HTTP_201_CREATED)
async def complete_forge_session(
    body: ForgeCompleteRequest,
    current_user: dict = Depends(get_current_user),
) -> ForgeSessionResponse:
    result = await forge_service.complete_forge_session(
        user_id=current_user["user_id"],
        skill_name=body.skill_name,
        skill_id=body.skill_id,
        duration_minutes=body.duration_minutes,
        session_type=body.session_type,
    )
    return ForgeSessionResponse(**result)
