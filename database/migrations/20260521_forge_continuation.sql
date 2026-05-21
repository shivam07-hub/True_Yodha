-- Forge continuation model (2026-05-21).
--
-- Old semantics: 1 forge_sessions row = 1 increment to forge_sessions_count,
-- regardless of duration. User had to commit a full 25-min Pomodoro to get
-- session credit. Partial sessions = thrown away.
--
-- New semantics: forge_sessions logs "bursts" (any duration). The user_skills
-- row aggregates total minutes spent. Session count is derived
-- (total_forge_minutes / 25), so partial bursts accumulate cleanly across the
-- day. XP credited per burst (rate × minutes).
--
-- forge_sessions_count stays as the persisted count of completed 25-min units
-- (still drives LEVEL_THRESHOLDS), but the service recomputes it from
-- total_forge_minutes on every burst rather than +1 per row.

ALTER TABLE user_skills
  ADD COLUMN IF NOT EXISTS total_forge_minutes INTEGER NOT NULL DEFAULT 0;

-- Backfill: pre-redesign rows had each forge_sessions row count as a full
-- 25-minute Pomodoro. Best-effort reconstruction sums duration_minutes when
-- present, else falls back to 25 × forge_sessions_count.
UPDATE user_skills us
SET total_forge_minutes = COALESCE(agg.total_minutes, us.forge_sessions_count * 25)
FROM (
  SELECT user_id, skill_id, SUM(COALESCE(duration_minutes, 25))::int AS total_minutes
  FROM forge_sessions
  GROUP BY user_id, skill_id
) agg
WHERE us.user_id = agg.user_id AND us.skill_id = agg.skill_id;

NOTIFY pgrst, 'reload schema';
