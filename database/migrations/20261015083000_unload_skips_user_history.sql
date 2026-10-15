-- Closed-job unload must leave rows a person has touched.
--
-- export_job_archive.py refuses to purge a job that appears in
-- user_job_matches, job_applications, job_feedback_events, or job_reports.
-- retire_closed_jobs did not. Matches, feedback, reports, skills, and
-- embeddings CASCADE off jobs. Applications no longer cascade, but the job
-- row is still the listing they point at.
--
-- The predicate is in both the lister and the deleter. A caller that passes
-- a protected id archives nothing for it: the DELETE does not see the row.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_unload_candidates(p_limit INTEGER DEFAULT 500)
RETURNS TABLE(job_id TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT j.job_id
    FROM public.jobs j
    WHERE j.listing_confidence = 'closed'
      AND j.deletion_eligible_at IS NOT NULL
      AND j.deletion_eligible_at <= NOW()
      AND COALESCE(j.quarantine_until, j.deletion_eligible_at) <= NOW()
      AND NOT EXISTS (
          SELECT 1 FROM public.user_job_matches m WHERE m.job_id = j.job_id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.job_applications a WHERE a.job_id = j.job_id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.job_feedback_events f WHERE f.job_id = j.job_id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.job_reports r WHERE r.job_id = j.job_id
      )
    ORDER BY j.deletion_eligible_at, j.job_id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
$$;

COMMENT ON FUNCTION public.list_unload_candidates(INTEGER) IS
    'Closed listings whose one-hour quarantine has elapsed and that have no user history, oldest first.';

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
          AND NOT EXISTS (
              SELECT 1 FROM public.user_job_matches m WHERE m.job_id = j.job_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.job_applications a WHERE a.job_id = j.job_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.job_feedback_events f WHERE f.job_id = j.job_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.job_reports r WHERE r.job_id = j.job_id
          )
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

COMMENT ON FUNCTION public.retire_closed_jobs(INTEGER, TEXT[]) IS
    'Deletes archived closed listings after the one-hour quarantine. Skips jobs with user history. p_job_ids is required.';

REVOKE ALL ON FUNCTION public.list_unload_candidates(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retire_closed_jobs(INTEGER, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unload_candidates(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.retire_closed_jobs(INTEGER, TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
