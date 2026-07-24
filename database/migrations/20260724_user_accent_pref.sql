-- Backlog ND15 — Signal/Forge accent toggle persistence.
-- Additive, nullable-with-default, no backfill needed (default covers existing rows).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS accent_pref TEXT NOT NULL DEFAULT 'signal'
    CHECK (accent_pref IN ('signal', 'forge'));
