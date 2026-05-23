-- 20260523c — CV upload idempotency_key + orphan sweep helper
--
-- ADR-0004 PR B: resilience layer for the 2-phase upload pattern.
--
-- Adds:
--   1. cv_upload_jobs.idempotency_key — client-generated UUID. Unique per
--      user so a retried POST returns the same job_id instead of double-
--      charging.
--   2. sweep_stale_cv_upload_jobs(minutes) RPC — marks any processing job
--      older than N minutes as failed + refunds via the existing refund_xp
--      idempotency guard. Run from a cron / startup hook to clean up jobs
--      orphaned by process restarts.

ALTER TABLE public.cv_upload_jobs
    ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Unique per user. Allow NULLs (legacy rows before this column existed).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cv_upload_jobs_user_idem
    ON public.cv_upload_jobs (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.cv_upload_jobs.idempotency_key IS
    'Client-generated UUID for retry-safe POST /cv/upload. Unique per user.';

-- Stale-job sweep — mark processing jobs older than `p_minutes` as failed
-- and refund their xp_charged via the existing refund_xp idempotency guard.
CREATE OR REPLACE FUNCTION public.sweep_stale_cv_upload_jobs(p_minutes integer DEFAULT 5)
RETURNS TABLE (job_id uuid, user_id uuid, refunded_amount integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT id, user_id, xp_charged
        FROM   public.cv_upload_jobs
        WHERE  status = 'processing'
          AND  created_at < now() - (p_minutes || ' minutes')::interval
        ORDER BY created_at
        LIMIT 200          -- bounded per sweep to keep tx short
    LOOP
        -- Mark failed first; refund_xp is idempotent so calling it on a row
        -- that another sweep already refunded is a no-op.
        UPDATE public.cv_upload_jobs
        SET    status       = 'failed',
               error_code   = 'orphaned',
               error_detail = 'Job exceeded ' || p_minutes ||
                              ' min in processing — server restart or stuck worker.',
               xp_refunded  = true,
               finished_at  = now()
        WHERE  id = r.id;

        IF r.xp_charged > 0 THEN
            PERFORM public.refund_xp(
                r.user_id, r.xp_charged, 'cv_upload',
                'orphaned_sweep', 'cv_upload_jobs', r.id::text
            );
        END IF;

        job_id := r.id;
        user_id := r.user_id;
        refunded_amount := r.xp_charged;
        RETURN NEXT;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
