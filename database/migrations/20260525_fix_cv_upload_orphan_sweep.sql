-- 20260525 — repair CV upload orphan sweep RPC ambiguity
--
-- Railway showed Postgres 42702 for sweep_stale_cv_upload_jobs:
-- "column reference user_id is ambiguous". The previous RETURNS TABLE output
-- column `user_id` shadowed the cv_upload_jobs.user_id column inside PL/pgSQL.
-- Recreate the function with a non-conflicting output name and table aliases.

DROP FUNCTION IF EXISTS public.sweep_stale_cv_upload_jobs(integer);

CREATE FUNCTION public.sweep_stale_cv_upload_jobs(p_minutes integer DEFAULT 5)
RETURNS TABLE (job_id uuid, swept_user_id uuid, refunded_amount integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stale_job record;
BEGIN
    FOR stale_job IN
        SELECT c.id, c.user_id, c.xp_charged
        FROM   public.cv_upload_jobs AS c
        WHERE  c.status = 'processing'
          AND  c.created_at < now() - (p_minutes || ' minutes')::interval
        ORDER BY c.created_at
        LIMIT 200
    LOOP
        UPDATE public.cv_upload_jobs AS c
        SET    status       = 'failed',
               error_code   = 'orphaned',
               error_detail = 'Job exceeded ' || p_minutes ||
                              ' min in processing - server restart or stuck worker.',
               xp_refunded  = true,
               finished_at  = now()
        WHERE  c.id = stale_job.id
          AND  c.status = 'processing';

        IF FOUND THEN
            IF COALESCE(stale_job.xp_charged, 0) > 0 THEN
                PERFORM public.refund_xp(
                    stale_job.user_id,
                    stale_job.xp_charged,
                    'cv_upload',
                    'orphaned_sweep',
                    'cv_upload_jobs',
                    stale_job.id::text
                );
            END IF;

            job_id := stale_job.id;
            swept_user_id := stale_job.user_id;
            refunded_amount := COALESCE(stale_job.xp_charged, 0);
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
