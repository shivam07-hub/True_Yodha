"""Tests for xp_service — idempotency, guards, accumulation."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.xp_service import earn_xp, get_xp_balance, grant_welcome_xp, spend_xp


def _mock_admin(balance: int = 100, welcome_granted: bool = False):
    admin = MagicMock()
    # get_xp_balance path
    admin.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "coin_balance": balance,
        "welcome_coins_granted": welcome_granted,
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
    assert "Insufficient Myro Coins" in exc_info.value.detail


@pytest.mark.asyncio
async def test_spend_xp_deducts_correctly():
    admin = _mock_admin(balance=200)
    admin.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await spend_xp("user-1", 50, "download_cv")
    assert new_balance == 150


# ── ADR-0004 (20260523b): atomic RPC-backed charge / refund ───────────────────
# These tests pin the *RPC call shape* — the Postgres function does the actual
# arithmetic + ledger write. The integration test for that lives in SQL land.


def _mock_admin_rpc(rpc_return: int | None = None, balance: int = 0):
    admin = MagicMock()
    # rpc(...).execute().data path
    admin.rpc.return_value.execute.return_value.data = rpc_return
    # get_xp_balance fallback path
    admin.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "coin_balance": balance,
    }
    return admin


@pytest.mark.asyncio
async def test_charge_or_raise_invokes_rpc_with_floor_and_ref():
    from app.services.xp_service import charge_or_raise
    admin = _mock_admin_rpc(rpc_return=100)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await charge_or_raise(
            "user-1", 200, "cv_upload", floor=0,
            ref_table="cv_upload_jobs", ref_id="job-abc",
        )
    assert new_balance == 100
    admin.rpc.assert_called_once_with("charge_coins", {
        "p_user_id": "user-1",
        "p_amount": 200,
        "p_action": "cv_upload",
        "p_floor": 0,
        "p_ref_table": "cv_upload_jobs",
        "p_ref_id": "job-abc",
    })


@pytest.mark.asyncio
async def test_charge_or_raise_raises_400_when_rpc_returns_null():
    """RPC returns NULL when xp_balance - amount < floor (row not updated)."""
    from fastapi import HTTPException
    from app.services.xp_service import charge_or_raise
    admin = _mock_admin_rpc(rpc_return=None, balance=50)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        with pytest.raises(HTTPException) as exc_info:
            await charge_or_raise("user-1", 200, "cv_upload", floor=0)
    assert exc_info.value.status_code == 400
    assert "Out of Myro Coins" in exc_info.value.detail
    # Detail surfaces the floor-respecting current balance from get_xp_balance
    assert "have 50" in exc_info.value.detail


@pytest.mark.asyncio
async def test_refund_invokes_rpc_with_action_and_ref():
    from app.services.xp_service import refund
    admin = _mock_admin_rpc(rpc_return=3000)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await refund(
            "user-1", 200, "cv_upload", reason="provider_unavailable",
            ref_table="cv_upload_jobs", ref_id="job-abc",
        )
    assert new_balance == 3000
    admin.rpc.assert_called_once_with("refund_coins", {
        "p_user_id": "user-1",
        "p_amount": 200,
        "p_action": "cv_upload",
        "p_reason": "provider_unavailable",
        "p_ref_table": "cv_upload_jobs",
        "p_ref_id": "job-abc",
    })


@pytest.mark.asyncio
async def test_charge_or_raise_zero_amount_is_noop():
    from app.services.xp_service import charge_or_raise
    admin = _mock_admin_rpc(balance=10)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        new_balance = await charge_or_raise("user-1", 0, "noop")
    assert new_balance == 10
    admin.rpc.assert_not_called()


@pytest.mark.asyncio
async def test_insufficient_xp_error_carries_amount_and_balance():
    """Callers branch on the structured exception fields, not the message text.
    Pin those fields so a regression that flattens the error is caught."""
    from app.services.xp_service import InsufficientXPError, charge_or_raise
    admin = _mock_admin_rpc(rpc_return=None, balance=42)
    with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
        with pytest.raises(InsufficientXPError) as exc_info:
            await charge_or_raise("u1", 200, "cv_upload", floor=0)
    assert exc_info.value.amount == 200
    assert exc_info.value.balance == 42
    assert exc_info.value.action == "cv_upload"
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_refund_emits_structured_metric(caplog):
    """metric refund.fired warning is what Grafana scrapes for alerting."""
    import logging
    from app.services.xp_service import refund
    admin = _mock_admin_rpc(rpc_return=3000)
    with caplog.at_level(logging.WARNING, logger="app.services.xp_service"):
        with patch("app.services.xp_service.get_supabase_admin", return_value=admin):
            await refund("u1", 200, "cv_upload", reason="provider_unavailable",
                         ref_table="cv_upload_jobs", ref_id="job-1")
    metric_lines = [r.getMessage() for r in caplog.records if "metric refund.fired" in r.getMessage()]
    assert len(metric_lines) == 1
    assert "action=cv_upload" in metric_lines[0]
    assert "reason=provider_unavailable" in metric_lines[0]
    assert "amount=200" in metric_lines[0]
