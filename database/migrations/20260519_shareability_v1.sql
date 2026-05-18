-- 20260519_shareability_v1.sql
-- Shareability v1 — public profile page (/profile/{ninja_name}).
-- Locks SH1 (ninja_name vanity slug), SH7 (referral attribution column).
--
-- Run order:
--   1. Apply this migration (columns nullable initially).
--   2. Run scripts/backfill_ninja_names.py to generate ninja_name for existing users.
--   3. Manually run the `ALTER COLUMN ninja_name SET NOT NULL;` block at the tail.
--
-- Frontend deploy must follow — page reads public_profile_v view.

BEGIN;

-- ── Columns ────────────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ninja_name TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES auth.users(id);

-- Uniqueness + lookup speed
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_ninja_name
  ON user_profiles (ninja_name)
  WHERE ninja_name IS NOT NULL;

-- ── Public read surface ────────────────────────────────────────────────────
-- Strict allowlist: ninja_name, score, domain_scores, tier, aggregate counters.
-- Never expose email, full_name, linkedin_url, or any PII.
CREATE OR REPLACE VIEW public_profile_v AS
  SELECT
    up.ninja_name,
    ms.mirror_score,
    ms.domain_scores,
    ms.tier_label,
    (SELECT COUNT(*) FROM forge_sessions    WHERE user_id = up.id) AS forge_sessions_count,
    (SELECT COUNT(*) FROM daily_logs        WHERE user_id = up.id) AS diary_count,
    (SELECT COUNT(*) FROM job_applications  WHERE user_id = up.id) AS tracker_count
  FROM user_profiles up
  LEFT JOIN mirror_scores ms ON ms.user_id = up.id
  WHERE up.ninja_name IS NOT NULL;

GRANT SELECT ON public_profile_v TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ── Tail: run AFTER backfill ───────────────────────────────────────────────
-- ALTER TABLE user_profiles ALTER COLUMN ninja_name SET NOT NULL;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM user_profiles WHERE ninja_name IS NULL;            -- pre-backfill
-- SELECT COUNT(*) FROM public_profile_v;                                  -- post-backfill
-- SELECT ninja_name, mirror_score FROM public_profile_v LIMIT 3;
