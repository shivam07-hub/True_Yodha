-- The orphan sweep refunds what the ledger says the job was charged (UP1).
--
-- It refunded `cv_upload_jobs.xp_charged`, a second copy of the charge that the
-- worker stamps AFTER `charge_coins` returns. A job swept between the two was
-- charged 200 (coin_ledger), stamped 0, refunded 0 and marked
-- `xp_refunded = true` — the one failed upload never paid back (2026-06-20,
-- found and refunded by hand 2026-10-22). The ledger row is written in the same
-- transaction as the charge, so it is the copy a sweep can trust.
--
-- `refund_coins` stays idempotent on (ref_table, ref_id), so a job a handler
-- already refunded is a no-op here. Reversible: re-apply the function from
-- 20260802173451_cv_upload_job_leases.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.sweep_stale_cv_upload_jobs(p_minutes integer DEFAULT 5)
RETURNS TABLE (job_id uuid, swept_user_id uuid, refunded_amount integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    stale_job record;
    v_charged integer;
BEGIN
    FOR stale_job IN
        SELECT c.id, c.user_id
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
            SELECT COALESCE(-SUM(l.delta), 0)::integer INTO v_charged
            FROM public.coin_ledger AS l
            WHERE l.ref_table = 'cv_upload_jobs'
              AND l.ref_id = stale_job.id::text
              AND l.delta < 0;

            IF v_charged > 0 THEN
                PERFORM public.refund_coins(
                    stale_job.user_id,
                    v_charged,
                    'cv_upload',
                    'orphaned_sweep',
                    'cv_upload_jobs',
                    stale_job.id::text
                );
            END IF;

            job_id := stale_job.id;
            swept_user_id := stale_job.user_id;
            refunded_amount := v_charged;
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
