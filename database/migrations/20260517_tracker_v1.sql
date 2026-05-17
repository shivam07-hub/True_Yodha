-- Tracker v1 — Process Transparency Layer build (2026-05-17 grill-me session)
-- Locks Q5 (legacy status migration), Q6 (first-offer tracking),
-- Q7 (stale clock column), Q10 (review FK preservation on app delete).
--
-- Run order: code deploy first (so no fresh "pending" writes), then this migration.
-- Spot-check `status='Responded'` rows BEFORE running — see CLAUDE.md backlog #8 sub-task.

-- ── Q5: Legacy status remap ────────────────────────────────────────────────
-- Audit before / after.
-- SELECT status, COUNT(*) FROM job_applications GROUP BY status ORDER BY 2 DESC;

UPDATE job_applications SET status = 'saved'     WHERE status = 'pending';
UPDATE job_applications SET status = 'screening' WHERE status = 'Responded';
UPDATE job_applications SET status = 'ghosted'   WHERE status = 'No response';
UPDATE job_applications SET status = 'withdrew'  WHERE status = 'Abandoned';

-- ── Q7: Dedicated stale-clock column ───────────────────────────────────────
-- Replaces updated_at as the stale signal so notes/followed_up edits don't fake-refresh the clock.

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS last_stage_changed_at TIMESTAMPTZ DEFAULT now();

UPDATE job_applications
  SET last_stage_changed_at = COALESCE(updated_at, created_at, now())
  WHERE last_stage_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_applications_last_stage_changed_at
  ON job_applications (last_stage_changed_at);

-- ── Q6: First-offer tracking ───────────────────────────────────────────────
-- Set once per user, on the first ever transition to status='offer'.
-- Drives the one-time sparkle on the tracker card.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS first_offer_at TIMESTAMPTZ;

-- ── Q10: Review survives parent delete ─────────────────────────────────────
-- Preserves public review on /companies/[slug] even if the user deletes their tracker row.
-- Drop the old FK, make column nullable, re-add as ON DELETE SET NULL.

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'application_reviews'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%job_application_id%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE application_reviews DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE application_reviews
  ALTER COLUMN job_application_id DROP NOT NULL;

ALTER TABLE application_reviews
  ADD CONSTRAINT application_reviews_job_application_id_fkey
  FOREIGN KEY (job_application_id)
  REFERENCES job_applications(id)
  ON DELETE SET NULL;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT status, COUNT(*) FROM job_applications GROUP BY status;
-- SELECT COUNT(*) FROM job_applications WHERE last_stage_changed_at IS NULL;   -- should be 0
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'application_reviews'::regclass AND contype = 'f';
