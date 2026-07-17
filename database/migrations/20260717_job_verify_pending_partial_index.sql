-- Verifier target selection was a 3.4s seq scan / 34k-row bitmap+sort: the
-- ORDER BY last_verification_attempt_at LIMIT could not use the composite
-- idx_jobs_verification_queue (its leading key is listing_confidence, and it is
-- NULLS FIRST) so Postgres materialized every pending row and top-N sorted. That
-- routinely tripped Supabase's edge timeout (Cloudflare 1101 -> HTTP 500),
-- crashing the best-effort sweep.
--
-- This partial index is keyed ONLY on the sort column with the confidence filter
-- baked into the predicate, matching the query's ordering (ASC NULLS LAST). The
-- planner reads the first N already-ordered, fully-covering leaf entries and
-- stops -> 3.4s -> ~1ms. apply_url is covered; the LIKE 'http%' filter drops a
-- negligible tail.
--
-- Apply on Supabase with CONCURRENTLY (cannot run inside a transaction block):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ... (as below, without the wrapper).
-- The idempotent form is kept here for migration tracking; already applied to
-- prod 2026-07-17.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_verify_pending
    ON public.jobs (last_verification_attempt_at ASC NULLS LAST)
    INCLUDE (job_id, job_title, apply_url)
    WHERE listing_confidence IN ('uncertain', 'likely_closed');

COMMENT ON INDEX public.idx_jobs_verify_pending IS
    'Ordered, covering queue index for job_listing_verifier target selection.';
