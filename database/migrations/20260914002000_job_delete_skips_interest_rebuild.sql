-- Derived verifier interest FKs to jobs. Child DELETE triggers were rebuilding
-- that row after the parent was already gone (cascade), which 23503s and also
-- runs a full refresh per child row — unusable at unload scale.
--
-- Contract: INSERT/UPDATE of a child may upsert interest (the job exists).
-- DELETE of a child refreshes only while the job row still exists. Parent
-- delete is CASCADE; child triggers must not run. Child DELETE triggers use
-- WHEN (EXISTS jobs row) so cascade after the parent is gone is a no-op.
-- session_replication_role=replica is superuser-only on this project.

BEGIN;

DROP TRIGGER IF EXISTS sync_job_verification_interest_exposures
    ON public.job_recommendation_exposures;
DROP TRIGGER IF EXISTS sync_job_verification_interest_exposures_del
    ON public.job_recommendation_exposures;
CREATE TRIGGER sync_job_verification_interest_exposures
AFTER INSERT OR UPDATE OF job_id, shown_at ON public.job_recommendation_exposures
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest_exposure();
CREATE TRIGGER sync_job_verification_interest_exposures_del
AFTER DELETE ON public.job_recommendation_exposures
FOR EACH ROW
WHEN (EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = OLD.job_id))
EXECUTE FUNCTION public.sync_job_verification_interest_exposure();

DROP TRIGGER IF EXISTS sync_job_verification_interest_applications
    ON public.job_applications;
DROP TRIGGER IF EXISTS sync_job_verification_interest_applications_del
    ON public.job_applications;
CREATE TRIGGER sync_job_verification_interest_applications
AFTER INSERT OR UPDATE OF job_id, status ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest_application();
CREATE TRIGGER sync_job_verification_interest_applications_del
AFTER DELETE ON public.job_applications
FOR EACH ROW
WHEN (EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = OLD.job_id))
EXECUTE FUNCTION public.sync_job_verification_interest_application();

DROP TRIGGER IF EXISTS sync_job_verification_interest_matches
    ON public.user_job_matches;
DROP TRIGGER IF EXISTS sync_job_verification_interest_matches_del
    ON public.user_job_matches;
CREATE TRIGGER sync_job_verification_interest_matches
AFTER INSERT OR UPDATE OF job_id ON public.user_job_matches
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest_match();
CREATE TRIGGER sync_job_verification_interest_matches_del
AFTER DELETE ON public.user_job_matches
FOR EACH ROW
WHEN (EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = OLD.job_id))
EXECUTE FUNCTION public.sync_job_verification_interest_match();

DROP TRIGGER IF EXISTS trg_refresh_job_intelligence_from_application
    ON public.job_applications;
DROP TRIGGER IF EXISTS trg_refresh_job_intelligence_from_application_del
    ON public.job_applications;
CREATE TRIGGER trg_refresh_job_intelligence_from_application
AFTER INSERT OR UPDATE OF status, job_id ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION private.refresh_job_intelligence_snapshot_trigger();
CREATE TRIGGER trg_refresh_job_intelligence_from_application_del
AFTER DELETE ON public.job_applications
FOR EACH ROW
WHEN (EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = OLD.job_id))
EXECUTE FUNCTION private.refresh_job_intelligence_snapshot_trigger();

DROP TRIGGER IF EXISTS trg_refresh_job_intelligence_from_feedback
    ON public.job_feedback_events;
DROP TRIGGER IF EXISTS trg_refresh_job_intelligence_from_feedback_del
    ON public.job_feedback_events;
CREATE TRIGGER trg_refresh_job_intelligence_from_feedback
AFTER INSERT ON public.job_feedback_events
FOR EACH ROW
EXECUTE FUNCTION private.refresh_job_intelligence_snapshot_trigger();
CREATE TRIGGER trg_refresh_job_intelligence_from_feedback_del
AFTER DELETE ON public.job_feedback_events
FOR EACH ROW
WHEN (EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = OLD.job_id))
EXECUTE FUNCTION private.refresh_job_intelligence_snapshot_trigger();

CREATE OR REPLACE FUNCTION public.retire_closed_jobs(
    p_limit INTEGER DEFAULT 500,
    p_job_ids TEXT[] DEFAULT NULL
)
RETURNS TABLE(job_id TEXT, deleted_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    candidate RECORD;
    snapshot JSONB;
    applications INTEGER;
    versions INTEGER;
    retired_at TIMESTAMPTZ;
    take INTEGER;
BEGIN
    IF p_limit < 1 OR p_limit > 5000 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 5000';
    END IF;
    IF p_job_ids IS NULL OR COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'p_job_ids required; archive the rows before retire_closed_jobs';
    END IF;
    take := LEAST(p_limit, array_length(p_job_ids, 1));

    FOR candidate IN
        SELECT j.*
        FROM public.jobs j
        WHERE j.listing_confidence = 'closed'
          AND j.deletion_eligible_at IS NOT NULL
          AND j.deletion_eligible_at <= NOW()
          AND COALESCE(j.quarantine_until, j.deletion_eligible_at) <= NOW()
          AND j.job_id = ANY (p_job_ids)
        ORDER BY j.deletion_eligible_at, j.job_id
        LIMIT take
        FOR UPDATE OF j SKIP LOCKED
    LOOP
        snapshot := private.job_snapshot_for(candidate.job_id);
        UPDATE public.job_applications
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.job_applications.job_id = candidate.job_id;
        UPDATE public.cv_versions
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.cv_versions.job_id = candidate.job_id;
        UPDATE public.cv_application_attempts
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.cv_application_attempts.job_id = candidate.job_id;
        UPDATE public.job_application_skill_targets
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.job_application_skill_targets.job_id = candidate.job_id;
        UPDATE public.job_application_milestones
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.job_application_milestones.job_id = candidate.job_id;

        SELECT COUNT(*) INTO applications
        FROM public.job_applications a WHERE a.job_id = candidate.job_id;
        SELECT COUNT(*) INTO versions
        FROM public.cv_versions v WHERE v.job_id = candidate.job_id;

        INSERT INTO public.job_retirement_events (
            job_id, company_id, lifecycle_reason, closed_at,
            application_count, cv_version_count, source_run_id
        ) VALUES (
            candidate.job_id, candidate.company_id, candidate.confidence_reason,
            candidate.retired_at, applications, versions, candidate.last_source_run_id
        ) RETURNING public.job_retirement_events.deleted_at INTO retired_at;

        DELETE FROM public.jobs j WHERE j.job_id = candidate.job_id;
        job_id := candidate.job_id;
        deleted_at := retired_at;
        RETURN NEXT;
    END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
