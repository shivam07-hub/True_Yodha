-- Keep active CV intake jobs distinct from abandoned jobs using a worker lease.
--
-- The former sweep used created_at + five minutes. A healthy provider call could
-- therefore be refunded and marked failed while its RQ worker was still running;
-- the worker could then overwrite that failure with done. A renewable lease now
-- reflects the worker's bounded 15-minute execution window, and application
-- terminal writes additionally require status='processing'.

BEGIN;

ALTER TABLE public.cv_upload_jobs
    ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

ALTER TABLE public.cv_upload_jobs
    ALTER COLUMN lease_expires_at
    SET DEFAULT (now() + interval '20 minutes');

UPDATE public.cv_upload_jobs
SET lease_expires_at = now() + interval '20 minutes'
WHERE status = 'processing'
  AND lease_expires_at IS NULL;

UPDATE public.cv_upload_jobs
SET lease_expires_at = NULL
WHERE status IN ('done', 'failed')
  AND lease_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cv_upload_jobs_processing_lease
    ON public.cv_upload_jobs (lease_expires_at)
    WHERE status = 'processing';

COMMENT ON COLUMN public.cv_upload_jobs.lease_expires_at IS
    'Renewable worker lease. The orphan sweep may fail/refund only processing rows whose lease has expired.';

CREATE OR REPLACE FUNCTION public.sweep_stale_cv_upload_jobs(p_minutes integer DEFAULT 5)
RETURNS TABLE (job_id uuid, swept_user_id uuid, refunded_amount integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    stale_job record;
BEGIN
    FOR stale_job IN
        SELECT c.id, c.user_id, c.xp_charged
        FROM public.cv_upload_jobs AS c
        WHERE c.status = 'processing'
          AND COALESCE(
              c.lease_expires_at,
              c.created_at + make_interval(mins => GREATEST(COALESCE(p_minutes, 5), 1))
          ) < now()
        ORDER BY COALESCE(c.lease_expires_at, c.created_at)
        LIMIT 200
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.cv_upload_jobs AS c
        SET status = 'failed',
            current_phase = 'failed',
            error_code = 'orphaned',
            error_detail = 'Job worker lease expired before analysis completed.',
            xp_refunded = true,
            lease_expires_at = NULL,
            finished_at = now()
        WHERE c.id = stale_job.id
          AND c.status = 'processing'
          AND COALESCE(
              c.lease_expires_at,
              c.created_at + make_interval(mins => GREATEST(COALESCE(p_minutes, 5), 1))
          ) < now();

        IF FOUND THEN
            IF COALESCE(stale_job.xp_charged, 0) > 0 THEN
                PERFORM public.refund_coins(
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
REVOKE ALL ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
