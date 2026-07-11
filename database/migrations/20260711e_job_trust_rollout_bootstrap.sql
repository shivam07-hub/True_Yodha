-- Seed the first trusted company-skill snapshot and tighten physical retirement.
BEGIN;

-- A bootstrap snapshot is complete as a database read, but it must never act as
-- absence evidence for deleting a listing. Retirement therefore requires the
-- exact complete source run that placed the job into quarantine.
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
        JOIN public.job_source_runs sr
          ON sr.id = j.last_source_run_id
         AND sr.company_id = j.company_id
         AND sr.status = 'complete'
         AND sr.completed_at >= j.quarantined_at
        WHERE j.listing_confidence = 'closed'
          AND j.quarantined_at IS NOT NULL
          AND j.quarantine_until <= NOW()
          AND j.deletion_eligible_at <= NOW()
        ORDER BY j.deletion_eligible_at, j.job_id
        LIMIT p_limit
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

REVOKE ALL ON FUNCTION public.retire_closed_jobs(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retire_closed_jobs(INTEGER) TO service_role;

-- One point-in-time baseline makes company intelligence useful immediately.
-- Normal scraper runs append future facts and carry zero-count facts for skills
-- that disappear, allowing the profile to become declining or dormant.
WITH bootstrap AS (
    SELECT gen_random_uuid() AS feed_run_id, NOW() AS observed_at
), company_counts AS (
    SELECT
        c.id AS company_id,
        c.canonical_name,
        COUNT(j.job_id) FILTER (
            WHERE j.listing_confidence = 'active' AND j.is_active IS TRUE
        )::INTEGER AS active_job_count
    FROM public.companies c
    LEFT JOIN public.jobs j ON j.company_id = c.id
    GROUP BY c.id, c.canonical_name
)
INSERT INTO public.job_source_runs (
    feed_run_id, company_name, source_key, provider, started_at, completed_at,
    status, observed_count, prior_good_count, coverage_ratio, parser_version,
    metadata, company_id
)
SELECT
    b.feed_run_id, cc.canonical_name, 'trusted-active-bootstrap', 'database',
    b.observed_at, b.observed_at, 'complete', cc.active_job_count,
    cc.active_job_count, 1, 'bootstrap-v1',
    jsonb_build_object(
        'purpose', 'initial_company_skill_profile',
        'absence_evidence', false
    ),
    cc.company_id
FROM company_counts cc
CROSS JOIN bootstrap b
ON CONFLICT (feed_run_id, company_name, source_key) DO NOTHING;

WITH bootstrap_runs AS (
    SELECT DISTINCT ON (company_id)
        id AS source_run_id, company_id, completed_at AS observed_at
    FROM public.job_source_runs
    WHERE source_key = 'trusted-active-bootstrap'
      AND parser_version = 'bootstrap-v1'
      AND status = 'complete'
    ORDER BY company_id, completed_at DESC, id DESC
), base AS (
    SELECT
        br.source_run_id,
        br.company_id,
        br.observed_at,
        js.skill_id,
        js.job_id,
        js.is_primary,
        js.required_level,
        COALESCE(NULLIF(j.role_domain, ''), 'Unspecified') AS role_domain,
        COALESCE(NULLIF(j.location_country, ''), 'Unspecified') AS location_country
    FROM bootstrap_runs br
    JOIN public.jobs j ON j.company_id = br.company_id
    JOIN public.job_skills js ON js.job_id = j.job_id
    WHERE j.listing_confidence = 'active'
      AND j.is_active IS TRUE
), totals AS (
    SELECT
        source_run_id, company_id, observed_at, skill_id,
        COUNT(DISTINCT job_id)::INTEGER AS active_job_count,
        COUNT(DISTINCT job_id) FILTER (WHERE is_primary)::INTEGER AS primary_job_count,
        ROUND(AVG(required_level)::NUMERIC, 2) AS average_required_level
    FROM base
    GROUP BY source_run_id, company_id, observed_at, skill_id
), level_counts AS (
    SELECT source_run_id, company_id, skill_id,
           jsonb_object_agg(required_level::TEXT, job_count ORDER BY required_level) AS counts
    FROM (
        SELECT source_run_id, company_id, skill_id, required_level,
               COUNT(DISTINCT job_id)::INTEGER AS job_count
        FROM base
        WHERE required_level IS NOT NULL
        GROUP BY source_run_id, company_id, skill_id, required_level
    ) grouped
    GROUP BY source_run_id, company_id, skill_id
), role_counts AS (
    SELECT source_run_id, company_id, skill_id,
           jsonb_object_agg(role_domain, job_count ORDER BY role_domain) AS counts
    FROM (
        SELECT source_run_id, company_id, skill_id, role_domain,
               COUNT(DISTINCT job_id)::INTEGER AS job_count
        FROM base
        GROUP BY source_run_id, company_id, skill_id, role_domain
    ) grouped
    GROUP BY source_run_id, company_id, skill_id
), location_counts AS (
    SELECT source_run_id, company_id, skill_id,
           jsonb_object_agg(location_country, job_count ORDER BY location_country) AS counts
    FROM (
        SELECT source_run_id, company_id, skill_id, location_country,
               COUNT(DISTINCT job_id)::INTEGER AS job_count
        FROM base
        GROUP BY source_run_id, company_id, skill_id, location_country
    ) grouped
    GROUP BY source_run_id, company_id, skill_id
)
INSERT INTO public.company_skill_run_facts (
    source_run_id, company_id, skill_id, active_job_count, primary_job_count,
    average_required_level, required_level_counts, role_domain_counts,
    location_counts, observed_at
)
SELECT
    t.source_run_id, t.company_id, t.skill_id, t.active_job_count,
    t.primary_job_count, t.average_required_level,
    COALESCE(lc.counts, '{}'::JSONB),
    COALESCE(rc.counts, '{}'::JSONB),
    COALESCE(loc.counts, '{}'::JSONB), t.observed_at
FROM totals t
LEFT JOIN level_counts lc USING (source_run_id, company_id, skill_id)
LEFT JOIN role_counts rc USING (source_run_id, company_id, skill_id)
LEFT JOIN location_counts loc USING (source_run_id, company_id, skill_id)
ON CONFLICT (source_run_id, company_id, skill_id) DO NOTHING;

DO $$
DECLARE
    source_run RECORD;
BEGIN
    FOR source_run IN
        SELECT id
        FROM public.job_source_runs
        WHERE source_key = 'trusted-active-bootstrap'
          AND parser_version = 'bootstrap-v1'
          AND status = 'complete'
    LOOP
        PERFORM public.refresh_company_skill_profiles(source_run.id);
    END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
