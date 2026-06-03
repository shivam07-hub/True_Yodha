-- 20260603_cv_master_revisions.sql
-- PR-3 (living-master, additive slice). Append-only revision history for the
-- user's Main CV ("master" ≡ latest_baseline cv_versions row).
--
-- WHY ADDITIVE: the living-master grill (project_ten_minute_cv_tail predecessor)
-- locked Q9 as a big-bang collapse of N baseline_upload rows → 1 master. That
-- collapse is the single riskiest op in the plan (FK repoint + deletes) and is
-- deliberately DECOUPLED here: this migration only ADDS the history table that
-- makes master edits non-destructive. Edits now MUTATE the master in place and
-- snapshot the prior state into this table first — so no data is ever lost even
-- though the pile is no longer grown per-keystroke. The destructive collapse
-- ships separately as 20260603b_cv_baseline_collapse.sql under Shivam's
-- supervised dry-run/backup/branch-DB run (feedback_supabase_migrations_manual).
--
-- Idempotent: safe to re-run (IF NOT EXISTS guards throughout).

BEGIN;

CREATE TABLE IF NOT EXISTS cv_master_revisions (
  id                 SERIAL       PRIMARY KEY,
  user_id            UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- The master row this snapshot was taken FROM. ON DELETE CASCADE: if the
  -- master is ever removed (e.g. account wipe), its history goes with it.
  master_version_id  INTEGER      NOT NULL REFERENCES cv_versions(id) ON DELETE CASCADE,
  revision_number    INTEGER      NOT NULL,
  -- Frozen snapshot of the master's content BEFORE the edit that superseded it.
  body_text          TEXT         NOT NULL DEFAULT '',
  cv_structured      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash      VARCHAR(64),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(master_version_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_cv_master_revisions_user
  ON cv_master_revisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cv_master_revisions_master
  ON cv_master_revisions(master_version_id, revision_number DESC);

-- recompute_finished_at already exists on cv_versions (20260519_cv_skill_edit).
-- Autosave reuses it via the existing skill_retag enqueue → SE17 poll/stream.

ALTER TABLE cv_master_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own cv master revisions" ON cv_master_revisions;
CREATE POLICY "own cv master revisions" ON cv_master_revisions
  FOR ALL USING (auth.uid() = user_id);

COMMIT;

-- PostgREST schema cache must be reloaded after schema changes
-- (feedback_postgrest_schema_reload: stale cache = phantom "column does not exist").
NOTIFY pgrst, 'reload schema';
