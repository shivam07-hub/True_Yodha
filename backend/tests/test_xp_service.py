"""Tests for xp_service — idempotency, guards, accumulation."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.xp_service import earn_xp, get_xp_balance, grant_welcome_xp, spend_xp


def _mock_admin(balance: int = 100, welcome_granted: bool = False):
    admin = MagicMock()
    # get_xp_balance path
    admin.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "xp_balance": balance,
        "welcome_xp_granted": welcome_granted,
    }
    # update path
    admin.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    return admin


@pytest.mark.asyncio
async def test_get_xp_balance_returns_integer():
    with patch("app.services.xp_service.get_supabase_admin", return_value=_mock_admin(balance=250)):
        result = await get_xp_balance("user-1")
    assert result == 250


@pytest.mark.asyncio
async def test_grant_welcome_xp_idempotent_when_already_granted():
    admin = _mock_admin(balance=1200, welcome_granted=True)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        balance = await grant_welcome_xp("user-1")
    # Should return current balance without updating
    assert balance == 1200
    admin.table.return_value.update.assert_not_called()


@pytest.mark.asyncio
async def test_grant_welcome_xp_grants_via_rpc_on_first_call():
    from app.services.xp_policy import WELCOME_XP

    admin = _mock_admin(balance=0, welcome_granted=False)
    # RPC returns post-update balance (atomic in DB).
    admin.rpc.return_value.execute.return_value.data = WELCOME_XP

    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        balance = await grant_welcome_xp("user-1")

    assert balance == WELCOME_XP
    admin.rpc.assert_called_once_with(
        "increment_xp_and_grant_welcome",
        {"p_user_id": "user-1", "p_amount": WELCOME_XP},
    )
    # No Python-side fallback UPDATE — atomicity lives in the DB.
    admin.table.return_value.update.assert_not_called()


@pytest.mark.asyncio
async def test_earn_xp_accumulates():
    admin = _mock_admin(balance=50)
    admin.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await earn_xp("user-1", 30)
    assert new_balance == 80


@pytest.mark.asyncio
async def test_spend_xp_insufficient_raises_400():
    from fastapi import HTTPException
    with patch("app.services.xp_service.get_supabase_admin", return_value=_mock_admin(balance=40)):
        with pytest.raises(HTTPException) as exc_info:
            await spend_xp("user-1", 100, "test_action")
    assert exc_info.value.status_code == 400
    assert "Insufficient XP" in exc_info.value.detail


@pytest.mark.asyncio
async def test_spend_xp_deducts_correctly():
    admin = _mock_admin(balance=200)
    admin.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await spend_xp("user-1", 50, "download_cv")
    assert new_balance == 150


# ── ADR-0004 charge_or_raise / refund ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_charge_or_raise_deducts_when_funded():
    from app.services.xp_service import charge_or_raise
    admin = _mock_admin(balance=300)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await charge_or_raise("user-1", 200, "cv_upload")
    assert new_balance == 100


@pytest.mark.asyncio
async def test_charge_or_raise_blocks_below_floor():
    from fastapi import HTTPException

    from app.services.xp_service import charge_or_raise
    admin = _mock_admin(balance=50)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        with pytest.raises(HTTPException) as exc_info:
            await charge_or_raise("user-1", 200, "cv_upload", floor=0)
    assert exc_info.value.status_code == 400
    assert "Out of XP" in exc_info.value.detail
    # No mutation when below floor
    admin.table.return_value.update.assert_not_called()


@pytest.mark.asyncio
async def test_charge_or_raise_allows_negative_when_floor_negative():
    from app.services.xp_service import charge_or_raise
    admin = _mock_admin(balance=5)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await charge_or_raise("user-1", 10, "follow", floor=-30)
    assert new_balance == -5


@pytest.mark.asyncio
async def test_refund_credits_balance():
    from app.services.xp_service import refund
    admin = _mock_admin(balance=100)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await refund("user-1", 200, "cv_upload", reason="provider_unavailable")
    assert new_balance == 300


@pytest.mark.asyncio
async def test_charge_or_raise_zero_amount_is_noop():
    from app.services.xp_service import charge_or_raise
    admin = _mock_admin(balance=10)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await charge_or_raise("user-1", 0, "noop")
    assert new_balance == 10
    admin.table.return_value.update.assert_not_called()
