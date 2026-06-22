"""
XP wallet service.

All mutations use the admin client (bypasses RLS) so the service can be called
from any context. grant_welcome_xp is idempotent — safe to call on every CV upload.
"""

import logging

from fastapi import HTTPException, status

from app.database import get_supabase_admin
from app.services.xp_policy import LINKEDIN_PROFILE_XP, WELCOME_XP

_log = logging.getLogger(__name__)


async def get_xp_balance(user_id: str) -> int:
    result = (
        get_supabase_admin()
        .table("user_profiles")
        .select("coin_balance")
        .eq("id", user_id)
        .single()
        .execute()
    )
    return int((result.data or {}).get("coin_balance", 0))


async def grant_welcome_xp(user_id: str) -> int:
    """Grant 3000 XP once after first successful CV analysis. Idempotent.

    Atomicity lives in the DB: increment_xp_and_grant_welcome flips
    welcome_xp_granted FALSE → TRUE in the same statement as the balance
    increment, so concurrent callers cannot double-grant.
    """
    admin = get_supabase_admin()
    check = (
        admin.table("user_profiles")
        .select("coin_balance, welcome_coins_granted")
        .eq("id", user_id)
        .single()
        .execute()
    )
    data = check.data or {}
    if data.get("welcome_coins_granted"):
        return int(data.get("coin_balance", 0))

    result = admin.rpc(
        "increment_xp_and_grant_welcome",
        {"p_user_id": user_id, "p_amount": WELCOME_XP},
    ).execute()
    return int(result.data)


async def earn_xp(user_id: str, amount: int) -> int:
    """Add XP to wallet. Returns new balance."""
    admin = get_supabase_admin()
    current = await get_xp_balance(user_id)
    new_balance = current + amount
    admin.table("user_profiles").update({"coin_balance": new_balance}).eq("id", user_id).execute()
    return new_balance


async def grant_linkedin_profile_xp(user_id: str) -> tuple[int, int]:
    """Grant LinkedIn profile XP once. Returns (coins_earned, new_balance)."""
    admin = get_supabase_admin()
    check = (
        admin.table("user_profiles")
        .select("coin_balance, linkedin_coins_granted")
        .eq("id", user_id)
        .single()
        .execute()
    )
    data = check.data or {}
    current = int(data.get("coin_balance", 0))
    if data.get("linkedin_coins_granted"):
        return 0, current

    new_balance = current + LINKEDIN_PROFILE_XP
    admin.table("user_profiles").update(
        {"coin_balance": new_balance, "linkedin_coins_granted": True}
    ).eq("id", user_id).execute()
    _log.info(
        "XP earn: user=%s action=linkedin_profile amount=%d balance=%d→%d",
        user_id,
        LINKEDIN_PROFILE_XP,
        current,
        new_balance,
    )
    return LINKEDIN_PROFILE_XP, new_balance


async def spend_xp(user_id: str, amount: int, action: str) -> int:
    """Deduct XP from wallet. Raises 400 if insufficient. Returns new balance."""
    admin = get_supabase_admin()
    current = await get_xp_balance(user_id)
    if current < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient Myro Coins — need {amount}, have {current}. Action: {action}",
        )
    new_balance = current - amount
    admin.table("user_profiles").update({"coin_balance": new_balance}).eq("id", user_id).execute()
    _log.info("XP spend: user=%s action=%s amount=%d balance=%d→%d", user_id, action, amount, current, new_balance)
    return new_balance


async def assert_can_spend_xp(user_id: str, amount: int, action: str) -> int:
    """Preflight an XP spend without mutating the wallet."""
    current = await get_xp_balance(user_id)
    if current < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient Myro Coins — need {amount}, have {current}. Action: {action}",
        )
    return current


async def spend_xp_to_floor(user_id: str, amount: int, action: str, floor: int = -30) -> int:
    """Deduct XP allowing balance down to `floor`. Raises 400 if floor would be breached."""
    admin = get_supabase_admin()
    current = await get_xp_balance(user_id)
    new_balance = current - amount
    if new_balance < floor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Myro Coin floor reached — balance would be {new_balance} (floor: {floor}). Action: {action}",
        )
    admin.table("user_profiles").update({"coin_balance": new_balance}).eq("id", user_id).execute()
    _log.info("XP spend: user=%s action=%s amount=%d balance=%d→%d", user_id, action, amount, current, new_balance)
    return new_balance


# ── ADR-0004: atomic charge / refund via SQL RPCs ─────────────────────────────
# These wrap charge_xp / refund_xp Postgres functions (migration 20260523b).
# The RPCs perform the read+update+ledger-insert in one transaction with a
# row lock, so two concurrent charges from the same user can't both win the
# balance >= cost check. Refunds are idempotent on (ref_table, ref_id).


class InsufficientXPError(HTTPException):
    """Raised when a charge would breach the floor. Callers add the
    user-facing CTA (diary, follow upsell, etc) since the right recovery
    depends on the action — diary is wrong for cosmetic actions like
    follow company (floor=-30, recovery is unfollow not earn-more)."""
    def __init__(self, *, amount: int, balance: int, action: str) -> None:
        self.amount = amount
        self.balance = balance
        self.action = action
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Out of Myro Coins — this action costs {amount} Myro Coins and you have {balance}.",
        )


async def charge_or_raise(
    user_id: str,
    amount: int,
    action: str,
    *,
    floor: int = 0,
    ref_table: str | None = None,
    ref_id: str | None = None,
) -> int:
    """Deduct `amount` XP atomically. Raises InsufficientXPError if floor breached.

    `ref_table` + `ref_id` link the charge to the originating row so the
    ledger entry can be queried later and `refund` can short-circuit double
    credits. Pass them whenever a row owns the charge (e.g. cv_upload_jobs).
    """
    if amount <= 0:
        return await get_xp_balance(user_id)
    admin = get_supabase_admin()
    result = admin.rpc("charge_coins", {
        "p_user_id": user_id,
        "p_amount": amount,
        "p_action": action,
        "p_floor": floor,
        "p_ref_table": ref_table,
        "p_ref_id": ref_id,
    }).execute()
    new_balance = result.data
    if new_balance is None:
        current = await get_xp_balance(user_id)
        raise InsufficientXPError(amount=amount, balance=current, action=action)
    _log.info(
        "XP charge: user=%s action=%s amount=%d balance=→%d ref=%s/%s",
        user_id, action, amount, int(new_balance), ref_table, ref_id,
    )
    return int(new_balance)


async def refund(
    user_id: str,
    amount: int,
    action: str,
    reason: str,
    *,
    ref_table: str,
    ref_id: str,
) -> int:
    """Credit `amount` XP back. Idempotent on (ref_table, ref_id) — calling
    twice for the same originating row is a no-op (returns current balance).

    The RPC scans coin_ledger for a prior `refund_*` entry tied to the same ref;
    if found, no mutation runs. This is the durable guard against the
    double-refund class of bugs (worker retries, manual replays).
    """
    if amount <= 0:
        return await get_xp_balance(user_id)
    admin = get_supabase_admin()
    result = admin.rpc("refund_coins", {
        "p_user_id": user_id,
        "p_amount": amount,
        "p_action": action,
        "p_reason": reason,
        "p_ref_table": ref_table,
        "p_ref_id": ref_id,
    }).execute()
    new_balance = int(result.data)
    _log.info(
        "XP refund: user=%s action=%s amount=%d balance=→%d ref=%s/%s reason=%s",
        user_id, action, amount, new_balance, ref_table, ref_id, reason,
    )
    # Structured metric — easy to grep/parse downstream (Grafana / log alerts).
    # Refund rate > 5% over a rolling window = LLM provider chain is degraded.
    _log.warning(
        "metric refund.fired action=%s reason=%s amount=%d ref=%s/%s",
        action, reason, amount, ref_table, ref_id,
    )
    return new_balance


async def reward(
    user_id: str,
    amount: int,
    action: str,
    reason: str,
    *,
    ref_table: str,
    ref_id: str,
) -> int:
    """Credit a behavioural reward. Idempotent on (action, ref_table, ref_id) —
    re-saving the same originating row is a no-op (returns current balance).

    Unlike `refund`, this is for positive engagement grants (e.g. adding a job to
    the tracker), not provider-failure credits, so it emits no refund metric.
    """
    if amount <= 0:
        return await get_xp_balance(user_id)
    admin = get_supabase_admin()
    result = admin.rpc("reward_coins", {
        "p_user_id": user_id,
        "p_amount": amount,
        "p_action": action,
        "p_reason": reason,
        "p_ref_table": ref_table,
        "p_ref_id": ref_id,
    }).execute()
    new_balance = int(result.data) if result.data is not None else await get_xp_balance(user_id)
    _log.info(
        "XP reward: user=%s action=%s amount=%d balance=→%d ref=%s/%s",
        user_id, action, amount, new_balance, ref_table, ref_id,
    )
    return new_balance
