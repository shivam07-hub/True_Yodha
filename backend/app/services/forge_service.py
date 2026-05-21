"""
Forge session service.

Handles XP earn, skill-level progression, and forge_sessions log.
Level thresholds are cumulative forge sessions on a single skill.
"""

import logging

from fastapi import HTTPException, status

from app.database import get_supabase_admin
from app.services.xp_service import earn_xp
from app.services.taxonomy_loader import ensure_skill_in_db

_log = logging.getLogger(__name__)

# Forge sessions needed to advance L{n} → L{n+1} (level 4 = max).
# Mirror lives in frontend/lib/level-thresholds.ts — update both together.
LEVEL_THRESHOLDS: dict[int, int] = {0: 1, 1: 3, 2: 9, 3: 27}

# XP per minute by session type
XP_RATE_BY_TYPE: dict[str, int] = {"ambient": 2, "focused": 3}


async def complete_forge_session(
    user_id: str,
    skill_name: str,
    skill_id: str | None,
    duration_minutes: int,
    session_type: str = "focused",
) -> dict:
    """
    Record a completed forge session. Returns session summary including
    any level-up that occurred and the new XP balance.
    """
    admin = get_supabase_admin()
    resolved_skill_id: int | None = None
    if skill_id:
        try:
            resolved_skill_id = int(skill_id)
        except (TypeError, ValueError):
            resolved_skill_id = None
    if resolved_skill_id is None:
        resolved_skill_id = ensure_skill_in_db(admin, skill_name)
    if resolved_skill_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown skill '{skill_name}'. Cannot record forge session.",
        )

    # 1. Earn XP — rate depends on session_type
    rate = XP_RATE_BY_TYPE.get(session_type, 3)
    xp_earned = max(1, duration_minutes) * rate
    new_xp_balance = await earn_xp(user_id, xp_earned)

    # 2. Fetch or create user_skills row (skill_id is canonical key — no skill_name col)
    existing = (
        admin.table("user_skills")
        .select("id, matched_level, forge_sessions_count")
        .eq("user_id", user_id)
        .eq("skill_id", resolved_skill_id)
        .maybe_single()
        .execute()
    )
    row = existing.data if existing else None

    if row:
        level_before = int(row.get("matched_level") or 0)
        sessions_count = int(row.get("forge_sessions_count") or 0) + 1
    else:
        level_before = 0
        sessions_count = 1
        admin.table("user_skills").insert({
            "user_id": user_id,
            "skill_id": resolved_skill_id,
            "matched_level": 0,
            "forge_sessions_count": 0,
        }).execute()

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

    (
        admin.table("user_skills")
        .update(update_payload)
        .eq("user_id", user_id)
        .eq("skill_id", resolved_skill_id)
        .execute()
    )

    # 5. Log forge session (forge_sessions retains skill_name for human-readable history)
    admin.table("forge_sessions").insert({
        "user_id": user_id,
        "skill_id": resolved_skill_id,
        "skill_name": skill_name,
        "level_before": level_before,
        "level_after": level_after,
        "sessions_toward_next": sessions_count,
        "duration_minutes": max(1, duration_minutes),
        "xp_earned": xp_earned,
    }).execute()

    next_threshold = LEVEL_THRESHOLDS.get(level_after)

    return {
        "xp_earned": xp_earned,
        "new_xp_balance": new_xp_balance,
        "level_before": level_before,
        "level_after": level_after,
        "leveled_up": level_after > level_before,
        "sessions_toward_next": sessions_count,
        "sessions_needed": next_threshold,
    }
