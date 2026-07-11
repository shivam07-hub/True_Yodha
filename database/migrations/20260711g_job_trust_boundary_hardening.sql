-- Enforce trusted discovery at the database boundary and cover lifecycle FKs.
BEGIN;

DROP POLICY IF EXISTS "jobs public read" ON public.jobs;
CREATE POLICY "jobs public read"
ON public.jobs
FOR SELECT
TO PUBLIC
USING (
    listing_confidence = 'active'
    AND is_active IS TRUE
);

CREATE INDEX IF NOT EXISTS idx_jobs_last_source_run_id
    ON public.jobs (last_source_run_id)
    WHERE last_source_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_skill_profiles_latest_source_run
    ON public.company_skill_profiles (latest_source_run_id)
    WHERE latest_source_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_recommendation_exposures_match_id
    ON public.job_recommendation_exposures (match_id)
    WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_retirement_events_company_id
    ON public.job_retirement_events (company_id)
    WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_retirement_events_source_run_id
    ON public.job_retirement_events (source_run_id)
    WHERE source_run_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
