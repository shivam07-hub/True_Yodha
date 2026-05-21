"""Tests for forge_service — continuation model (partial bursts accumulate)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.forge_service import (
    LEVEL_THRESHOLDS,
    SESSION_MINUTES,
    XP_RATE_BY_TYPE,
    complete_forge_session,
    get_last_forged_skill,
)


def _make_admin(level: int = 0, sessions_count: int = 0, total_minutes: int | None = None, has_row: bool = True):
    """Build a mock Supabase admin client.

    `total_minutes` defaults to sessions_count * SESSION_MINUTES so legacy-style
    tests (which think in completed sessions) still work; pass it explicitly to
    test mid-session continuation behavior.
    """
    if total_minutes is None:
        total_minutes = sessions_count * SESSION_MINUTES
    admin = MagicMock()
    row = (
        {
            "matched_level": level,
            "forge_sessions_count": sessions_count,
            "total_forge_minutes": total_minutes,
        }
        if has_row
        else None
    )
    admin.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = row
    admin.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    admin.table.return_value.insert.return_value.execute.return_value = MagicMock()
    return admin


async def _run(
    admin_template,
    *,
    level: int,
    sessions_count: int,
    duration: int = 25,
    session_type: str = "focused",
    total_minutes: int | None = None,
    has_row: bool = True,
) -> dict:
    admin = _make_admin(level, sessions_count, total_minutes=total_minutes, has_row=has_row)
    with (
        patch("app.services.forge_service.get_supabase_admin", return_value=admin),
        patch("app.services.forge_service.ensure_skill_in_db", return_value=99),
        patch("app.services.forge_service.earn_xp", return_value=duration * XP_RATE_BY_TYPE[session_type]),
    ):
        result = await complete_forge_session("user-1", "Python", None, duration, session_type=session_type)
    result["_admin"] = admin
    return result


@pytest.mark.asyncio
async def test_level_up_fires_at_l0_threshold():
    # Fresh user: 0 minutes + 25-min burst → 1 derived session → L0→L1 threshold met.
    result = await _run(None, level=0, sessions_count=0)
    assert result["leveled_up"] is True
    assert result["level_after"] == 1
    assert result["sessions_toward_next"] == 1


@pytest.mark.asyncio
async def test_no_level_up_before_threshold():
    # L1, only 25 minutes accumulated; burst adds another 25 → 2 sessions. L1→L2 needs 3.
    result = await _run(None, level=1, sessions_count=1, total_minutes=25)
    assert result["leveled_up"] is False
    assert result["sessions_toward_next"] == 2


@pytest.mark.asyncio
async def test_level_up_l1_to_l2_at_threshold():
    # L1, 50 minutes done (2 sessions). 25-min burst → total 75 min → 3 sessions → L2.
    result = await _run(None, level=1, sessions_count=2, total_minutes=50)
    assert result["leveled_up"] is True
    assert result["level_after"] == 2


@pytest.mark.asyncio
async def test_partial_burst_accrues_without_session_credit():
    # 10 min into a fresh skill, 5-min burst → still under 25-min boundary. No new session.
    result = await _run(None, level=0, sessions_count=0, duration=5, total_minutes=10)
    assert result["leveled_up"] is False
    assert result["sessions_toward_next"] == 0
    assert result["total_forge_minutes"] == 15
    assert result["minutes_to_next_session"] == SESSION_MINUTES - 15


@pytest.mark.asyncio
async def test_partial_burst_completes_session_when_crossing_25():
    # 22 min done, 4-min burst → 26 total → derived sessions = 1 → fires L0→L1.
    result = await _run(None, level=0, sessions_count=0, duration=4, total_minutes=22)
    assert result["leveled_up"] is True
    assert result["sessions_toward_next"] == 1
    assert result["total_forge_minutes"] == 26


@pytest.mark.asyncio
async def test_session_count_never_decreases():
    # If admin reported a higher count than minutes would derive (pre-redesign rows),
    # the service preserves the larger value rather than rolling backward.
    result = await _run(None, level=0, sessions_count=2, total_minutes=10, duration=1)
    assert result["sessions_toward_next"] >= 2


@pytest.mark.asyncio
async def test_no_overshoot_past_l4():
    result = await _run(None, level=4, sessions_count=200, total_minutes=200 * SESSION_MINUTES)
    assert result["leveled_up"] is False
    assert result["level_after"] == 4


@pytest.mark.asyncio
async def test_xp_earned_scales_with_burst_minutes():
    # Focused: 3 XP/min × 7 min = 21
    result = await _run(None, level=0, sessions_count=0, duration=7)
    assert result["xp_earned"] == 7 * XP_RATE_BY_TYPE["focused"]


@pytest.mark.asyncio
async def test_xp_earned_uses_ambient_rate():
    result = await _run(None, level=0, sessions_count=0, duration=7, session_type="ambient")
    assert result["xp_earned"] == 7 * XP_RATE_BY_TYPE["ambient"]


@pytest.mark.asyncio
async def test_sessions_needed_reflects_next_threshold():
    result = await _run(None, level=0, sessions_count=0)
    assert result["sessions_needed"] == LEVEL_THRESHOLDS[result["level_after"]] or result["sessions_needed"] is None


@pytest.mark.asyncio
async def test_new_skill_row_created_when_missing():
    admin = _make_admin(has_row=False)
    with (
        patch("app.services.forge_service.get_supabase_admin", return_value=admin),
        patch("app.services.forge_service.ensure_skill_in_db", return_value=42),
        patch("app.services.forge_service.earn_xp", return_value=50),
    ):
        result = await complete_forge_session("user-1", "Docker", None, 25)
    assert result["level_before"] == 0
    # insert called twice: user_skills row + forge_sessions log
    assert admin.table.return_value.insert.call_count == 2


@pytest.mark.asyncio
async def test_skill_name_is_resolved_to_canonical_skill_id_for_tracker_updates():
    admin = _make_admin(level=0, sessions_count=0)
    with (
        patch("app.services.forge_service.get_supabase_admin", return_value=admin),
        patch("app.services.forge_service.ensure_skill_in_db", return_value=42),
        patch("app.services.forge_service.earn_xp", return_value=14),
    ):
        result = await complete_forge_session("user-1", "python", None, 7, session_type="ambient")

    assert result["xp_earned"] == 14
    update_chain = admin.table.return_value.update.return_value.eq.return_value.eq
    update_chain.assert_called_with("skill_id", 42)


@pytest.mark.asyncio
async def test_unknown_skill_raises_400_not_500():
    admin = _make_admin(has_row=False)
    with (
        patch("app.services.forge_service.get_supabase_admin", return_value=admin),
        patch("app.services.forge_service.ensure_skill_in_db", return_value=None),
        patch("app.services.forge_service.earn_xp", return_value=0) as earn,
    ):
        with pytest.raises(HTTPException) as exc:
            await complete_forge_session("user-1", "MadeUpSkill", None, 25)
    assert exc.value.status_code == 400
    earn.assert_not_called()
    admin.table.return_value.insert.assert_not_called()


def test_get_last_forged_skill_returns_most_recent():
    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        {"skill_id": 42, "skill_name": "Python", "completed_at": "2026-05-21T10:00:00Z"}
    ]
    with patch("app.services.forge_service.get_supabase_admin", return_value=admin):
        result = get_last_forged_skill("user-1")
    assert result == {"skill_id": "42", "skill_name": "Python"}


def test_get_last_forged_skill_returns_none_when_empty():
    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    with patch("app.services.forge_service.get_supabase_admin", return_value=admin):
        result = get_last_forged_skill("user-1")
    assert result is None
