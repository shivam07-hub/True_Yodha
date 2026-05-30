-- #6 CV-upload loading redesign — real deploy-style phases.
-- Adds a coarse phase marker so the loading screen can show truthful progress
-- (Reading your CV → Scoring your domains → Ready) instead of a lying clock.
-- 3 phases only; matching runs post-done and is NOT a phase on this screen.

ALTER TABLE cv_upload_jobs
  ADD COLUMN IF NOT EXISTS current_phase TEXT;

COMMENT ON COLUMN cv_upload_jobs.current_phase IS
  'Coarse loading phase: queued | reading | scoring | ready | failed. '
  'Written progressively by _run_cv_upload_job; read by the CvScoreProgress UI.';

-- Backfill terminal rows so historical jobs read sensibly if ever polled.
UPDATE cv_upload_jobs SET current_phase = 'ready'  WHERE status = 'done'   AND current_phase IS NULL;
UPDATE cv_upload_jobs SET current_phase = 'failed' WHERE status = 'failed' AND current_phase IS NULL;

NOTIFY pgrst, 'reload schema';
