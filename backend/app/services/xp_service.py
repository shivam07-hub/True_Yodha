"""
XP wallet service.

All mutations use the admin client (bypasses RLS) so the service can be called
from any context. grant_welcome_xp is idempotent — safe to call on every CV upload.
"""

import logging

from fastapi import HTTPException, status

from app.database import get_supabase_admin

_log = logging.getLogger(__name__)


async def get_xp_balance(user_id: str) -> int:
    result = (
        get_supabase_admin()
        .table("user_profiles")
        .select("xp_balance")
        .eq("id", user_id)
        .single()
        .execute()
    )
    return int((result.data or {}).get("xp_balance", 0))


async def grant_welcome_xp(user_id: str) -> int:
    """Grant 1000 XP once after first successful CV analysis. Idempotent."""
    admin = get_supabase_admin()
    check = (
        admin.table("user_profiles")
        .select("xp_balance, welcome_xp_granted")
        .eq("id", user_id)
        .single()
        .execute()
    )
    data = check.data or {}
    if data.get("welcome_xp_granted"):
        return int(data.get("xp_balance", 0))

    result = (
        admin.rpc(
            "increment_xp_and_grant_welcome",
            {"p_user_id": user_id, "p_amount": 1000},
        ).execute()
    )
    if result.data is not None:
        return int(result.data)

    # Fallback: direct UPDATE if RPC not yet deployed
    updated = (
        admin.table("user_profiles")
        .update({"xp_balance": int(data.get("xp_balance", 0)) + 1000, "welcome_xp_granted": True})
        .eq("id", user_id)
        .execute()
    )
    return int((updated.data or [{}])[0].get("xp_balance", 1000))


async def earn_xp(user_id: str, amount: int) -> int:
    """Add XP to wallet. Returns new balance."""
    admin = get_supabase_admin()
    current = await get_xp_balance(user_id)
    new_balance = current + amount
    admin.table("user_profiles").update({"xp_balance": new_balance}).eq("id", user_id).execute()
    return new_balance


async def spend_xp(user_id: str, amount: int, action: str) -> int:
    """Deduct XP from wallet. Raises 400 if insufficient. Returns new balance."""
    admin = get_supabase_admin()
    current = await get_xp_balance(user_id)
    if current < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient XP — need {amount}, have {current}. Action: {action}",
        )
    new_balance = current - amount
    admin.table("user_profiles").update({"xp_balance": new_balance}).eq("id", user_id).execute()
    _log.info("XP spend: user=%s action=%s amount=%d balance=%d→%d", user_id, action, amount, current, new_balance)
    return new_balance


async def spend_xp_to_floor(user_id: str, amount: int, action: str, floor: int = -30) -> int:
    """Deduct XP allowing balance down to `floor`. Raises 400 if floor would be breached."""
    admin = get_supabase_admin()
    current = await get_xp_balance(user_id)
    new_balance = current - amount
    if new_balance < floor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"XP floor reached — balance would be {new_balance} (floor: {floor}). Action: {action}",
        )
    admin.table("user_profiles").update({"xp_balance": new_balance}).eq("id", user_id).execute()
    _log.info("XP spend: user=%s action=%s amount=%d balance=%d→%d", user_id, action, amount, current, new_balance)
    return new_balance
