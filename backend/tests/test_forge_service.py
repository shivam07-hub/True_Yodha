"""Tests for forge_service — level-up thresholds, no overshoot past L4."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.forge_service import LEVEL_THRESHOLDS, XP_RATE_BY_TYPE, complete_forge_session


def _make_admin(level: int = 0, sessions_count: int = 0, has_row: bool = True):
    admin = MagicMock()
    row = {"matched_level": level, "forge_sessions_count": sessions_count} if has_row else None
    admin.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = row
    admin.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    admin.table.return_value.insert.return_value.execute.return_value = MagicMock()
    return admin


async def _run(admin, level: int, sessions_count: int, has_row: bool = True) -> dict:
    with (
        patch("app.services.forge_service.get_supabase_admin", return_value=_make_admin(level, sessions_count, has_row)),
        patch("app.services.forge_service.earn_xp", return_value=sessions_count * 50 + 50),
    ):
        return await complete_forge_session("user-1", "Python", None, 25)


@pytest.mark.asyncio
async def test_level_up_fires_at_threshold_3():
    result = await _run(MagicMock(), level=0, sessions_count=2)
    assert result["leveled_up"] is True
    assert result["level_after"] == 1


@pytest.mark.asyncio
async def test_no_level_up_before_threshold():
    result = await _run(MagicMock(), level=0, sessions_count=1)
    assert result["leveled_up"] is False
    assert result["level_after"] == 0


@pytest.mark.asyncio
async def test_level_up_l1_to_l2_at_9():
    result = await _run(MagicMock(), level=1, sessions_count=8)
    assert result["leveled_up"] is True
    assert result["level_after"] == 2


@pytest.mark.asyncio
async def test_no_overshoot_past_l4():
    # At L4 (max), no further progression regardless of sessions
    result = await _run(MagicMock(), level=4, sessions_count=200)
    assert result["leveled_up"] is False
    assert result["level_after"] == 4


@pytest.mark.asyncio
async def test_sessions_needed_reflects_next_threshold():
    result = await _run(MagicMock(), level=0, sessions_count=0)
    assert result["sessions_needed"] == LEVEL_THRESHOLDS[result["level_after"]] or result["sessions_needed"] is None


@pytest.mark.asyncio
async def test_xp_earned_uses_rate_by_session_type():
    # focused: 3 XP/min × 25 min = 75
    result = await _run(MagicMock(), level=0, sessions_count=0)
    assert result["xp_earned"] == 25 * XP_RATE_BY_TYPE["focused"]
    # ambient: 2 XP/min × 25 min = 50
    with (
        patch("app.services.forge_service.get_supabase_admin", return_value=_make_admin(0, 0)),
        patch("app.services.forge_service.earn_xp", return_value=50),
    ):
        ambient = await complete_forge_session("user-1", "Python", None, 25, session_type="ambient")
    assert ambient["xp_earned"] == 25 * XP_RATE_BY_TYPE["ambient"]


@pytest.mark.asyncio
async def test_new_skill_row_created_when_missing():
    admin = _make_admin(has_row=False)
    with (
        patch("app.services.forge_service.get_supabase_admin", return_value=admin),
        patch("app.services.forge_service.earn_xp", return_value=50),
    ):
        result = await complete_forge_session("user-1", "Docker", None, 25)
    assert result["level_before"] == 0
    # insert called twice: user_skills row creation + forge_sessions log
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
