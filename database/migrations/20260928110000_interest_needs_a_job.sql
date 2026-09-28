-- Verifier interest is only recorded for a job that exists.
--
-- 20260914002000 wrote the contract "INSERT/UPDATE of a child may upsert
-- interest (the job exists)". Two children do not guarantee that:
-- `job_applications` carries no FK to jobs (an application outlives its
-- listing; `job_snapshot` keeps the JD) and neither does
-- `job_recommendation_exposures`. Once a closed listing is unloaded, updating
-- the status of an application to it tripped
-- `job_verification_interest_job_id_fkey` and the PUT returned 500
-- (Notice unhandled_500:APIError:app/repositories/jobs.py:upsert_application).
-- A listing that is gone has nothing to verify.
--
-- `refresh_job_verification_interest` already returns early for a missing job;
-- the two direct inserts now do the same. `user_job_matches` has its own FK to
-- jobs and is unchanged.
--
-- Reverse: re-apply the two function bodies from 20260813092900.

begin;

create or replace function public.sync_job_verification_interest_application()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
    END IF;
    IF TG_OP = 'DELETE'
       OR COALESCE(NEW.status, '') IN ('rejected', 'withdrawn', 'closed') THEN
        PERFORM public.refresh_job_verification_interest(
            CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END
        );
        RETURN NULL;
    END IF;
    IF NEW.job_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = NEW.job_id) THEN
        INSERT INTO public.job_verification_interest (
            job_id, application_tracked, updated_at
        ) VALUES (NEW.job_id, true, now())
        ON CONFLICT (job_id) DO UPDATE SET
            application_tracked = true,
            updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN NULL;
END;
$function$;

create or replace function public.sync_job_verification_interest_exposure()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
        RETURN NULL;
    END IF;
    IF NEW.job_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = NEW.job_id) THEN
        INSERT INTO public.job_verification_interest (job_id, shown_until, updated_at)
        VALUES (NEW.job_id, NEW.shown_at + interval '30 days', now())
        ON CONFLICT (job_id) DO UPDATE SET
            shown_until = greatest(
                public.job_verification_interest.shown_until,
                EXCLUDED.shown_until
            ),
            updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN NULL;
END;
$function$;

commit;
