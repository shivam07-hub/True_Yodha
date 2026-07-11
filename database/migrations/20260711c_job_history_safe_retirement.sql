-- Preserve user history before physically removing quarantined job listings.

ALTER TABLE public.job_applications
    ADD COLUMN IF NOT EXISTS job_snapshot JSONB;
ALTER TABLE public.cv_versions
    ADD COLUMN IF NOT EXISTS job_snapshot JSONB;
ALTER TABLE public.cv_application_attempts
    ADD COLUMN IF NOT EXISTS job_snapshot JSONB;
ALTER TABLE public.job_application_skill_targets
    ADD COLUMN IF NOT EXISTS job_snapshot JSONB;
ALTER TABLE public.job_application_milestones
    ADD COLUMN IF NOT EXISTS job_snapshot JSONB;
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS last_source_run_id UUID
        REFERENCES public.job_source_runs(id) ON DELETE SET NULL;
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS quarantine_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION private.job_snapshot_for(p_job_id TEXT)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'job_id', j.job_id,
        'job_title', j.job_title,
        'company_name', j.company_name,
        'company_id', j.company_id,
        'job_description', j.job_description,
        'job_summary', j.job_summary,
        'apply_url', j.apply_url,
        'location', j.location,
        'location_raw', j.location_raw,
        'location_city', j.location_city,
        'location_country', j.location_country,
        'location_mode', j.location_mode,
        'location_quality', j.location_quality,
        'locations', j.locations,
        'role_domain', j.role_domain,
        'industry', COALESCE(j.industry_group, j.industry),
        'main_skills', j.main_skills,
        'date_posted', j.date_posted,
        'first_seen', j.first_seen,
        'last_seen', j.last_seen,
        'retired_at', j.retired_at,
        'listing_confidence', j.listing_confidence
    ))
    FROM public.jobs j
    WHERE j.job_id = p_job_id
$$;

UPDATE public.job_applications h
SET job_snapshot = private.job_snapshot_for(h.job_id)
WHERE h.job_snapshot IS NULL;
UPDATE public.cv_versions h
SET job_snapshot = private.job_snapshot_for(h.job_id)
WHERE h.job_id IS NOT NULL AND h.job_snapshot IS NULL;
UPDATE public.cv_application_attempts h
SET job_snapshot = private.job_snapshot_for(h.job_id)
WHERE h.job_snapshot IS NULL;
UPDATE public.job_application_skill_targets h
SET job_snapshot = private.job_snapshot_for(h.job_id)
WHERE h.job_snapshot IS NULL;
UPDATE public.job_application_milestones h
SET job_snapshot = private.job_snapshot_for(h.job_id)
WHERE h.job_snapshot IS NULL;

CREATE OR REPLACE FUNCTION private.capture_job_history_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.job_id IS NOT NULL
       AND (NEW.job_snapshot IS NULL OR NEW.job_snapshot = '{}'::JSONB) THEN
        NEW.job_snapshot := private.job_snapshot_for(NEW.job_id);
    END IF;
    RETURN NEW;
END
$$;

-- Application history remains editable after its raw job disappears. Avoid the
-- legacy aggregate trigger attempting to insert an FK-backed pulse for an
-- already-retired job.
CREATE OR REPLACE FUNCTION private.refresh_job_intelligence_snapshot_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_job_id TEXT;
BEGIN
    target_job_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END;
    IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = target_job_id) THEN
        PERFORM private.refresh_job_intelligence_snapshot(target_job_id);
    ELSE
        DELETE FROM public.job_intelligence_snapshots s
        WHERE s.job_id = target_job_id;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
        IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = OLD.job_id) THEN
            PERFORM private.refresh_job_intelligence_snapshot(OLD.job_id);
        ELSE
            DELETE FROM public.job_intelligence_snapshots s
            WHERE s.job_id = OLD.job_id;
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_job_applications_snapshot ON public.job_applications;
CREATE TRIGGER trg_job_applications_snapshot
BEFORE INSERT OR UPDATE OF job_id ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION private.capture_job_history_snapshot();

DROP TRIGGER IF EXISTS trg_cv_versions_job_snapshot ON public.cv_versions;
CREATE TRIGGER trg_cv_versions_job_snapshot
BEFORE INSERT OR UPDATE OF job_id ON public.cv_versions
FOR EACH ROW EXECUTE FUNCTION private.capture_job_history_snapshot();

DROP TRIGGER IF EXISTS trg_cv_attempts_job_snapshot ON public.cv_application_attempts;
CREATE TRIGGER trg_cv_attempts_job_snapshot
BEFORE INSERT OR UPDATE OF job_id ON public.cv_application_attempts
FOR EACH ROW EXECUTE FUNCTION private.capture_job_history_snapshot();

DROP TRIGGER IF EXISTS trg_job_targets_snapshot ON public.job_application_skill_targets;
CREATE TRIGGER trg_job_targets_snapshot
BEFORE INSERT OR UPDATE OF job_id ON public.job_application_skill_targets
FOR EACH ROW EXECUTE FUNCTION private.capture_job_history_snapshot();

DROP TRIGGER IF EXISTS trg_job_milestones_snapshot ON public.job_application_milestones;
CREATE TRIGGER trg_job_milestones_snapshot
BEFORE INSERT OR UPDATE OF job_id ON public.job_application_milestones
FOR EACH ROW EXECUTE FUNCTION private.capture_job_history_snapshot();

-- User history owns its job_id after capture. Operational rows retain cascades.
DO $$
DECLARE
    target REGCLASS;
    fk RECORD;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'public.job_applications'::REGCLASS,
        'public.cv_versions'::REGCLASS,
        'public.job_application_skill_targets'::REGCLASS,
        'public.job_application_milestones'::REGCLASS
    ] LOOP
        FOR fk IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = target
              AND contype = 'f'
              AND confrelid = 'public.jobs'::regclass
        LOOP
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target, fk.conname);
        END LOOP;
    END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS public.job_retirement_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    job_id TEXT NOT NULL,
    company_id BIGINT REFERENCES public.companies(id) ON DELETE SET NULL,
    lifecycle_reason TEXT,
    closed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    application_count INTEGER NOT NULL DEFAULT 0,
    cv_version_count INTEGER NOT NULL DEFAULT 0,
    source_run_id UUID REFERENCES public.job_source_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_retirement_events_job
    ON public.job_retirement_events (job_id, deleted_at DESC);
ALTER TABLE public.job_retirement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_retirement_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.job_retirement_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.job_retirement_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.retire_closed_jobs(p_limit INTEGER DEFAULT 500)
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
BEGIN
    IF p_limit < 1 OR p_limit > 5000 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 5000';
    END IF;

    FOR candidate IN
        SELECT j.*
        FROM public.jobs j
        WHERE j.listing_confidence = 'closed'
          AND j.quarantine_until <= NOW()
          AND j.deletion_eligible_at <= NOW()
          AND EXISTS (
              SELECT 1
              FROM public.job_source_runs sr
              WHERE sr.company_id = j.company_id
                AND sr.status = 'complete'
          )
        ORDER BY j.deletion_eligible_at, j.job_id
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
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

        SELECT COUNT(*) INTO applications FROM public.job_applications a
        WHERE a.job_id = candidate.job_id;
        SELECT COUNT(*) INTO versions FROM public.cv_versions v
        WHERE v.job_id = candidate.job_id;

        INSERT INTO public.job_retirement_events (
            job_id, company_id, lifecycle_reason, closed_at,
            application_count, cv_version_count, source_run_id
        ) VALUES (
            candidate.job_id, candidate.company_id, candidate.lifecycle_reason,
            candidate.retired_at, applications, versions, candidate.last_source_run_id
        ) RETURNING public.job_retirement_events.deleted_at INTO retired_at;

        DELETE FROM public.jobs j WHERE j.job_id = candidate.job_id;
        job_id := candidate.job_id;
        deleted_at := retired_at;
        RETURN NEXT;
    END LOOP;
END
$$;

REVOKE ALL ON FUNCTION private.job_snapshot_for(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.capture_job_history_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retire_closed_jobs(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retire_closed_jobs(INTEGER) TO service_role;

COMMENT ON FUNCTION public.retire_closed_jobs(INTEGER) IS
    'Physically deletes only closed, quarantined jobs after company rollup completion.';

NOTIFY pgrst, 'reload schema';
