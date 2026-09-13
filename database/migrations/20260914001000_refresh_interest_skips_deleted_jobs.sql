-- Safety net only. Child DELETE still fires this function; we no-op when the
-- job is gone. The design is 20260914002000: those triggers must not run after
-- the parent row is gone, and retire_closed_jobs skips user triggers on DELETE.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_job_verification_interest(p_job_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_application_tracked boolean;
    v_shown_until timestamptz;
    v_matched boolean;
BEGIN
    IF p_job_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.jobs j WHERE j.job_id = p_job_id
    ) THEN
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.job_applications a
        WHERE a.job_id = p_job_id
          AND COALESCE(a.status, '') NOT IN ('rejected', 'withdrawn', 'closed')
    ) INTO v_application_tracked;

    SELECT max(e.shown_at) + interval '30 days'
    FROM public.job_recommendation_exposures e
    WHERE e.job_id = p_job_id
    INTO v_shown_until;

    SELECT EXISTS (
        SELECT 1
        FROM public.user_job_matches m
        WHERE m.job_id = p_job_id
    ) INTO v_matched;

    IF NOT v_application_tracked
       AND (v_shown_until IS NULL OR v_shown_until < now())
       AND NOT v_matched THEN
        DELETE FROM public.job_verification_interest WHERE job_id = p_job_id;
        RETURN;
    END IF;

    INSERT INTO public.job_verification_interest (
        job_id, application_tracked, shown_until, matched, updated_at
    ) VALUES (
        p_job_id, v_application_tracked, v_shown_until, v_matched, now()
    )
    ON CONFLICT (job_id) DO UPDATE SET
        application_tracked = EXCLUDED.application_tracked,
        shown_until = EXCLUDED.shown_until,
        matched = EXCLUDED.matched,
        updated_at = EXCLUDED.updated_at;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
