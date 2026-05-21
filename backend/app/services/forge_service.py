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

# Minutes that constitute one "session" toward level threshold (continuation model).
SESSION_MINUTES: int = 25


async def complete_forge_session(
    user_id: str,
    skill_name: str,
    skill_id: str | None,
    duration_minutes: int,
    session_type: str = "focused",
) -> dict:
    """
    Record a forge burst (any duration > 0). Continuation model:

      - total_forge_minutes accumulates across all bursts on the same skill.
      - forge_sessions_count = total_forge_minutes // SESSION_MINUTES.
        Partial bursts no longer round-down to zero — they accrue toward the
        next 25-minute unit.
      - XP is credited per burst (rate × minutes). Users are not punished
        for stopping mid-session.
      - Level-up triggers when derived sessions_count crosses a LEVEL_THRESHOLD.
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

    burst_minutes = max(1, duration_minutes)

    # 1. Earn XP — rate depends on session_type, scales linearly with burst minutes.
    rate = XP_RATE_BY_TYPE.get(session_type, 3)
    xp_earned = burst_minutes * rate
    new_xp_balance = await earn_xp(user_id, xp_earned)

    # 2. Fetch or create user_skills row.
    existing = (
        admin.table("user_skills")
        .select("id, matched_level, forge_sessions_count, total_forge_minutes")
        .eq("user_id", user_id)
        .eq("skill_id", resolved_skill_id)
        .maybe_single()
        .execute()
    )
    row = existing.data if existing else None

    if row:
        level_before = int(row.get("matched_level") or 0)
        prev_total_minutes = int(row.get("total_forge_minutes") or 0)
        prev_sessions_count = int(row.get("forge_sessions_count") or 0)
    else:
        level_before = 0
        prev_total_minutes = 0
        prev_sessions_count = 0
        admin.table("user_skills").insert({
            "user_id": user_id,
            "skill_id": resolved_skill_id,
            "matched_level": 0,
            "forge_sessions_count": 0,
            "total_forge_minutes": 0,
        }).execute()

    new_total_minutes = prev_total_minutes + burst_minutes
    # Derived sessions count: floor(total_minutes / 25). Never decreases.
    derived_sessions = max(prev_sessions_count, new_total_minutes // SESSION_MINUTES)

    # 3. Check level-up against derived count.
    threshold = LEVEL_THRESHOLDS.get(level_before)
    level_after = level_before
    if threshold is not None and level_before < 4 and derived_sessions >= threshold:
        level_after = level_before + 1

    # 4. Update user_skills.
    update_payload: dict = {
        "forge_sessions_count": derived_sessions,
        "total_forge_minutes": new_total_minutes,
    }
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

    # 5. Log the burst as a forge_sessions row. duration_minutes records this
    #    burst only; sessions_toward_next records the cumulative derived count.
    admin.table("forge_sessions").insert({
        "user_id": user_id,
        "skill_id": resolved_skill_id,
        "skill_name": skill_name,
        "level_before": level_before,
        "level_after": level_after,
        "sessions_toward_next": derived_sessions,
        "duration_minutes": burst_minutes,
        "xp_earned": xp_earned,
    }).execute()

    next_threshold = LEVEL_THRESHOLDS.get(level_after)

    return {
        "xp_earned": xp_earned,
        "new_xp_balance": new_xp_balance,
        "level_before": level_before,
        "level_after": level_after,
        "leveled_up": level_after > level_before,
        "sessions_toward_next": derived_sessions,
        "sessions_needed": next_threshold,
        "total_forge_minutes": new_total_minutes,
        "minutes_to_next_session": SESSION_MINUTES - (new_total_minutes % SESSION_MINUTES),
    }


def get_last_forged_skill(user_id: str) -> dict | None:
    """Return the most recently forged skill for a user, or None.

    Used by the frontend top widget to auto-resume forging after the user
    taps the Forge entry point.
    """
    admin = get_supabase_admin()
    result = (
        admin.table("forge_sessions")
        .select("skill_id, skill_name, completed_at")
        .eq("user_id", user_id)
        .order("completed_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None
    row = rows[0]
    return {
        "skill_id": str(row["skill_id"]) if row.get("skill_id") is not None else None,
        "skill_name": row.get("skill_name"),
    }
