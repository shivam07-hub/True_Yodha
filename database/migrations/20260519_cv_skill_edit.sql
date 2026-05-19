-- 20260519_cv_skill_edit.sql
-- Backlog #16 follow-up: inline skill-driven baseline edits.
--
-- Adds `recompute_finished_at` so the Skills page can poll for async re-tag
-- completion after a /cv/skill-edit save creates a new baseline_upload row.
-- NULL = recompute in flight (or never queued for legacy rows).
-- Stamped to NOW() when the background tagger + record_cv_score finish.

BEGIN;

ALTER TABLE cv_versions
  ADD COLUMN IF NOT EXISTS recompute_finished_at TIMESTAMPTZ NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
