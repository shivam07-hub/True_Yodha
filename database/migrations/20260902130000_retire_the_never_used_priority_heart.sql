-- Retire the manual priority heart. Not deprecated — never used.
--
-- Shipped 2026-07-29 (`20260729113000_job_application_priority.sql` +
-- `a3ec84f1`) as the primary icon control on every Collections card, on both
-- desktop and mobile. Measured 2026-09-02, five weeks later:
--
--   job_applications with is_priority = true          1
--   …of those, with priority_marked_at stamped        0
--
-- `PUT /jobs/applications/{job_id}/priority` ALWAYS stamps `priority_marked_at`
-- when setting priority, and has done since the same commit that created the
-- column. A row with `is_priority = true` and a NULL stamp therefore did not
-- come from the endpoint. No human has ever pressed the control.
--
-- It is not worth keeping and re-siting. The Collection Record's stage ladder
-- (found → saved → tailored → applied) is already the ranking, and it is
-- derived from things the user does for their own reasons — saving is the
-- claim, tailoring is the commitment — rather than from a curation chore they
-- have to maintain. A hand-maintained rank only works if it is maintained.
--
-- The two orderings that tie-broke on it now sort on `match_score`, the fit
-- number Myro already computes and already prints on the card beside them.
--
-- EXPAND-CONTRACT: the code that stopped reading and writing these columns
-- ships FIRST, in the same commit as this file. Apply this only after that is
-- deployed.
--
-- REVERSIBLE: both are additive re-adds and no meaningful data is lost — the
-- single true row has no stamp and no provenance.

ALTER TABLE public.job_applications
  DROP COLUMN IF EXISTS is_priority,
  DROP COLUMN IF EXISTS priority_marked_at;

NOTIFY pgrst, 'reload schema';
