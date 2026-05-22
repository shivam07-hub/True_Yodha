"""XP debit-at-start, refund-on-failure helpers for Job Refresh.

Single seam owns the wallet mutation. Callers don't preflight separately —
`charge` either succeeds and returns the new balance, or raises 400.
Refund is symmetric: bump balance back by the original charge amount.
"""

from __future__ import annotations

import logging

from app.services import xp_service

_log = logging.getLogger(__name__)


async def charge(user_id: str, amount: int) -> int:
    """Debit XP. Raises HTTP 400 via xp_service if balance < amount."""
    return await xp_service.spend_xp(user_id, amount, "refresh_matches")


async def refund(user_id: str, amount: int) -> int | None:
    """Credit XP back. Logs + swallows errors — refund failure must never mask
    the original compute error the caller is about to surface."""
    if amount <= 0:
        return None
    try:
        # Negative spend = credit. spend_xp_to_floor never under-credits.
        return await xp_service.spend_xp_to_floor(
            user_id, -amount, "refresh_matches_refund"
        )
    except Exception as exc:
        _log.error(
            "Refund failed for user=%s amount=%d: %s", user_id, amount, exc, exc_info=True
        )
        return None
