"""
Forge level thresholds (declaration only).

The time-based forge XP earn and the forge_sessions reads were removed —
leveling now comes from Upskilling quiz clears (DEC-1a, see upskilling_service)
and the home practice streak reads upskilling activity
(upskilling_service.list_activity_dates).

LEVEL_THRESHOLDS stays as the canonical backend declaration of the grandfathered
cumulative-session level model; its live mirror is frontend/lib/level-thresholds.ts
— update both together.
"""

# Forge sessions needed to advance L{n} → L{n+1} (level 4 = max).
LEVEL_THRESHOLDS: dict[int, int] = {0: 1, 1: 3, 2: 9, 3: 27}
