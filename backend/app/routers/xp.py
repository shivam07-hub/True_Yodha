from fastapi import APIRouter, Depends

from app.deps import Principal, get_principal
from app.schemas.xp import XPBalanceResponse, XPSpendRequest
from app.services import xp_service

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
