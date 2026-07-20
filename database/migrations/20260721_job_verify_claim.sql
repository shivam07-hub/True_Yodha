-- Listing verification: due-queue index + atomic claim RPC.
--
-- Replaces the confidence-scoped PostgREST target query, which had three
-- structural faults:
--   1. it filtered `listing_confidence IN ('uncertain','likely_closed')`, so a
--      row once marked `active` was never re-checked — liveness decayed silently;
--   2. read and stamp were separate round-trips, so a crash mid-sweep persisted
--      nothing and overlapping ticks re-picked the same rows while others starved;
--   3. it carried `apply_url=like.http%` in the query string — the bare `%` is an
--      invalid percent-escape, which the Supabase edge rejected with a Cloudflare
--      1101 HTML body. postgrest then tried to JSON-decode HTML and the whole
--      sweep died (verified in prod logs 2026-07-20).
--
-- Claiming stamps `last_verification_attempt_at` in the SAME statement that
-- selects, under FOR UPDATE SKIP LOCKED. One row goes to exactly one worker; a
-- crash after the claim costs that batch one cycle instead of blocking the queue.

-- Due-queue index: ordering column first, payload INCLUDEd so the claim scan is
-- index-only. Partial on the same predicates the RPC uses, keeping the retired
-- and non-http tail out of the index entirely.
CREATE INDEX IF NOT EXISTS idx_jobs_verify_due
    ON public.jobs (last_verification_attempt_at ASC NULLS FIRST)
    INCLUDE (job_id, job_title, apply_url)
    WHERE retired_at IS NULL AND apply_url LIKE 'http%';

CREATE OR REPLACE FUNCTION public.claim_verify_targets(
    p_limit int DEFAULT 200,
    p_stale interval DEFAULT '7 days'
)
RETURNS TABLE (
    job_id text,
    job_title text,
    apply_url text,
    listing_confidence text
)
LANGUAGE sql
AS $$
    WITH due AS (
        SELECT j.job_id
        FROM public.jobs j
        WHERE j.retired_at IS NULL
          AND j.apply_url LIKE 'http%'
          AND (
              j.last_verification_attempt_at IS NULL
              OR j.last_verification_attempt_at < now() - p_stale
          )
        -- NULLS FIRST + oldest-first is what makes the queue starvation-free:
        -- the never-checked tail always drains before anything is re-checked.
        ORDER BY j.last_verification_attempt_at ASC NULLS FIRST
        LIMIT greatest(1, least(p_limit, 1000))
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.jobs j
       SET last_verification_attempt_at = now()
      FROM due
     WHERE j.job_id = due.job_id
    RETURNING j.job_id, j.job_title, j.apply_url, j.listing_confidence;
$$;

COMMENT ON FUNCTION public.claim_verify_targets(int, interval) IS
    'Atomically claim the oldest-unchecked listings for verification. Stamps '
    'last_verification_attempt_at on claim so a crashed sweep cannot re-serve '
    'the same batch. Confidence-agnostic by design: `active` rows re-enter the '
    'queue once stale.';

-- Count of listings currently past their staleness horizon. Served by
-- idx_jobs_verify_due; the health signal a draining belt trends toward zero.
CREATE OR REPLACE FUNCTION public.count_verify_due(
    p_stale interval DEFAULT '7 days'
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
    SELECT count(*)
    FROM public.jobs j
    WHERE j.retired_at IS NULL
      AND j.apply_url LIKE 'http%'
      AND (
          j.last_verification_attempt_at IS NULL
          OR j.last_verification_attempt_at < now() - p_stale
      );
$$;

REVOKE ALL ON FUNCTION public.claim_verify_targets(int, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_verify_due(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_verify_targets(int, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_verify_due(interval) TO service_role;
