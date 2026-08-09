from fastapi import APIRouter, Depends

from app.deps import Principal, get_principal
from app.schemas.xp import XPBalanceResponse
from app.services import xp_service

# Read-only. There is deliberately no generic "spend N coins" endpoint: a charge
# is owned by the surface that did the paid work, and it happens only after that
# work landed. See CONTEXT.md "Coin balance".
router = APIRouter(prefix="/users/me", tags=["xp"])


@router.get("/xp", response_model=XPBalanceResponse)
async def get_xp_balance(
    principal: Principal = Depends(get_principal),
) -> XPBalanceResponse:
    balance = await xp_service.get_xp_balance(principal.id)
    return XPBalanceResponse(balance=balance)
