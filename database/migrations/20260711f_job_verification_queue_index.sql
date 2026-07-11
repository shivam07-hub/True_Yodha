-- Keep bounded verifier target selection below the PostgREST request timeout.
CREATE INDEX IF NOT EXISTS idx_jobs_verification_queue
    ON public.jobs (
        listing_confidence,
        last_verification_attempt_at ASC NULLS FIRST,
        job_id
    )
    INCLUDE (job_title, apply_url);

COMMENT ON INDEX public.idx_jobs_verification_queue IS
    'Covers the uncertain-listing queue consumed by job_listing_verifier.';
