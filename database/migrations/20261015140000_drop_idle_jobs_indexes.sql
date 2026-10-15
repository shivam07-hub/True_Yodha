-- Idle indexes on jobs. Each DROP runs outside a transaction
-- (CONCURRENTLY). Rollback is the CREATE under the statement.
--
-- The three verification indexes keyed last_verification_attempt_at.
-- claim_verify_targets reads job_verification_schedule since 2026-08-13.
-- idx_jobs_job_content_hash and idx_jobs_has_summary have had zero scans
-- since stats started on 2026-07-12. idx_jobs_location_states_gin and
-- idx_jobs_deletion_eligible stay: the feed filters location_states, and
-- Unload lists by deletion_eligible_at.

-- CREATE INDEX idx_jobs_verification_queue ON public.jobs USING btree (listing_confidence, last_verification_attempt_at NULLS FIRST, job_id) INCLUDE (job_title, apply_url);
DROP INDEX CONCURRENTLY IF EXISTS public.idx_jobs_verification_queue;

-- CREATE INDEX idx_jobs_verify_due ON public.jobs USING btree (last_verification_attempt_at NULLS FIRST) INCLUDE (job_id, job_title, apply_url) WHERE ((retired_at IS NULL) AND (apply_url ~~ 'http%'::text));
DROP INDEX CONCURRENTLY IF EXISTS public.idx_jobs_verify_due;

-- CREATE INDEX idx_jobs_verify_pending ON public.jobs USING btree (last_verification_attempt_at) INCLUDE (job_id, job_title, apply_url) WHERE (listing_confidence = ANY (ARRAY['uncertain'::text, 'likely_closed'::text]));
DROP INDEX CONCURRENTLY IF EXISTS public.idx_jobs_verify_pending;

-- CREATE INDEX idx_jobs_job_content_hash ON public.jobs USING btree (job_content_hash) WHERE (job_content_hash IS NOT NULL);
DROP INDEX CONCURRENTLY IF EXISTS public.idx_jobs_job_content_hash;

-- CREATE INDEX idx_jobs_has_summary ON public.jobs USING btree (((job_summary IS NOT NULL)));
DROP INDEX CONCURRENTLY IF EXISTS public.idx_jobs_has_summary;
