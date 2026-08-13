-- Feed exposure recording is a hot write seam. The first incremental model
-- called a generic refresh that re-read applications + exposures + matches for
-- every inserted row. Replace it with source-specific constant-time upserts;
-- only deletes/state reversals need a targeted reconciliation.

CREATE OR REPLACE FUNCTION public.sync_job_verification_interest_exposure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
        RETURN NULL;
    END IF;
    IF NEW.job_id IS NOT NULL THEN
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
$$;

CREATE OR REPLACE FUNCTION public.sync_job_verification_interest_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    IF NEW.job_id IS NOT NULL THEN
        INSERT INTO public.job_verification_interest (
            job_id, application_tracked, updated_at
        ) VALUES (NEW.job_id, true, now())
        ON CONFLICT (job_id) DO UPDATE SET
            application_tracked = true,
            updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_job_verification_interest_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
        RETURN NULL;
    END IF;
    IF NEW.job_id IS NOT NULL THEN
        INSERT INTO public.job_verification_interest (job_id, matched, updated_at)
        VALUES (NEW.job_id, true, now())
        ON CONFLICT (job_id) DO UPDATE SET
            matched = true,
            updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_job_verification_interest_exposure()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_job_verification_interest_application()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_job_verification_interest_match()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_job_verification_interest_exposures
    ON public.job_recommendation_exposures;
CREATE TRIGGER sync_job_verification_interest_exposures
AFTER INSERT OR UPDATE OF job_id, shown_at OR DELETE ON public.job_recommendation_exposures
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest_exposure();

DROP TRIGGER IF EXISTS sync_job_verification_interest_applications
    ON public.job_applications;
CREATE TRIGGER sync_job_verification_interest_applications
AFTER INSERT OR UPDATE OF job_id, status OR DELETE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest_application();

DROP TRIGGER IF EXISTS sync_job_verification_interest_matches
    ON public.user_job_matches;
CREATE TRIGGER sync_job_verification_interest_matches
AFTER INSERT OR UPDATE OF job_id OR DELETE ON public.user_job_matches
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest_match();
