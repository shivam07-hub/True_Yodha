"""
Forge session service.

Handles XP earn, skill-level progression, and forge_sessions log.
Level thresholds are cumulative forge sessions on a single skill.
"""

import logging

from app.database import get_supabase_admin
from app.services.xp_service import earn_xp

_log = logging.getLogger(__name__)

# Cumulative forge sessions needed to reach next level (level 4 = max)
LEVEL_THRESHOLDS: dict[int, int] = {0: 3, 1: 9, 2: 27, 3: 108}

XP_PER_SESSION = 50


async def complete_forge_session(
    user_id: str,
    skill_name: str,
    skill_id: str | None,
    duration_minutes: int,
) -> dict:
    """
    Record a completed forge session. Returns session summary including
    any level-up that occurred and the new XP balance.
    """
    admin = get_supabase_admin()

    # 1. Earn XP
    new_xp_balance = await earn_xp(user_id, XP_PER_SESSION)

    # 2. Fetch or create user_skills row
    skill_filter = (
        admin.table("user_skills").select("id, matched_level, forge_sessions_count")
        .eq("user_id", user_id)
    )
    if skill_id:
        skill_filter = skill_filter.eq("skill_id", skill_id)
    else:
        skill_filter = skill_filter.eq("skill_name", skill_name)

    existing = skill_filter.maybe_single().execute()
    row = existing.data if existing else None

    if row:
        level_before = int(row.get("matched_level") or 0)
        sessions_count = int(row.get("forge_sessions_count") or 0) + 1
    else:
        level_before = 0
        sessions_count = 1
        # Insert new user_skills row
        insert_payload: dict = {
            "user_id": user_id,
            "matched_level": 0,
            "forge_sessions_count": 0,
            "skill_name": skill_name,
        }
        if skill_id:
            insert_payload["skill_id"] = skill_id
        admin.table("user_skills").insert(insert_payload).execute()

    # 3. Check level-up
    threshold = LEVEL_THRESHOLDS.get(level_before)
    level_after = level_before
    if threshold is not None and level_before < 4 and sessions_count >= threshold:
        level_after = level_before + 1

    # 4. Update user_skills
    update_payload: dict = {"forge_sessions_count": sessions_count}
    if level_after != level_before:
        update_payload["matched_level"] = level_after
        _log.info("Skill level-up: user=%s skill=%s %d→%d", user_id, skill_name, level_before, level_after)

    update_q = admin.table("user_skills").update(update_payload).eq("user_id", user_id)
    if skill_id:
        update_q = update_q.eq("skill_id", skill_id)
    else:
        update_q = update_q.eq("skill_name", skill_name)
    update_q.execute()

    # 5. Log forge session
    session_payload: dict = {
        "user_id": user_id,
        "skill_name": skill_name,
        "level_before": level_before,
        "level_after": level_after,
        "sessions_toward_next": sessions_count,
        "duration_minutes": max(1, duration_minutes),
        "xp_earned": XP_PER_SESSION,
    }
    if skill_id:
        try:
            session_payload["skill_id"] = int(skill_id)
        except (ValueError, TypeError):
            pass
    admin.table("forge_sessions").insert(session_payload).execute()

    next_threshold = LEVEL_THRESHOLDS.get(level_after)

    return {
        "xp_earned": XP_PER_SESSION,
        "new_xp_balance": new_xp_balance,
        "level_before": level_before,
        "level_after": level_after,
        "leveled_up": level_after > level_before,
        "sessions_toward_next": sessions_count,
        "sessions_needed": next_threshold,
    }
