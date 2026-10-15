-- Hosted internships (Apply here) vs career-page jobs (Apply on the portal).
-- Additive: existing rows stay career_page / full_time. Intern corpus rows are
-- discovered by seniority/title, never backfilled.

BEGIN;

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS listing_venue text NOT NULL DEFAULT 'career_page',
    ADD COLUMN IF NOT EXISTS employment_kind text NOT NULL DEFAULT 'full_time',
    ADD COLUMN IF NOT EXISTS stipend_low_inr integer,
    ADD COLUMN IF NOT EXISTS stipend_high_inr integer,
    ADD COLUMN IF NOT EXISTS duration_months integer,
    ADD COLUMN IF NOT EXISTS ppo boolean;

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_listing_venue_check;
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_listing_venue_check
    CHECK (listing_venue IN ('career_page', 'myro'));

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_employment_kind_check;
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_employment_kind_check
    CHECK (employment_kind IN ('full_time', 'internship'));

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_hosted_paid_internship_check;
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_hosted_paid_internship_check
    CHECK (
        listing_venue <> 'myro'
        OR (
            employment_kind = 'internship'
            AND stipend_low_inr IS NOT NULL
            AND stipend_low_inr > 0
        )
    );

CREATE INDEX IF NOT EXISTS jobs_internships_live_idx
    ON public.jobs (is_active, listing_venue, employment_kind)
    WHERE is_active IS TRUE
      AND (employment_kind = 'internship' OR listing_venue = 'myro');

ALTER TABLE public.job_apply_intents
    DROP CONSTRAINT IF EXISTS job_apply_intents_destination_type_check;
ALTER TABLE public.job_apply_intents
    ADD CONSTRAINT job_apply_intents_destination_type_check CHECK (
        destination_type IN ('direct_role', 'career_search', 'hosted_role')
    );

ALTER TABLE public.job_apply_intents
    DROP CONSTRAINT IF EXISTS job_apply_intents_surface_check;
ALTER TABLE public.job_apply_intents
    ADD CONSTRAINT job_apply_intents_surface_check CHECK (surface IN (
        'dashboard', 'market', 'collections', 'cv_playground', 'cv_export',
        'mobile_jobs', 'mobile_collections', 'agent_pick', 'internships', 'other'
    ));

CREATE OR REPLACE FUNCTION public.record_job_apply_intent(
    p_job_id text,
    p_client_event_id uuid,
    p_surface text,
    p_destination_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    IF (((SELECT auth.jwt()) ->> 'is_anonymous')::boolean) IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Permanent account required' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.job_apply_intents (
        user_id,
        job_id,
        client_event_id,
        surface,
        destination_type,
        verified_live_at,
        confidence_at_click,
        enrichment_status,
        clicked_at
    )
    VALUES (
        v_user_id,
        p_job_id,
        p_client_event_id,
        p_surface,
        p_destination_type,
        (
            SELECT job.last_verified_live_at
            FROM public.jobs AS job
            WHERE job.job_id = p_job_id
            LIMIT 1
        ),
        (
            SELECT job.listing_confidence
            FROM public.jobs AS job
            WHERE job.job_id = p_job_id
            LIMIT 1
        ),
        CASE p_destination_type
            WHEN 'career_search' THEN 'discovery'
            ELSE 'direct'
        END,
        now()
    )
    ON CONFLICT (user_id, client_event_id) DO NOTHING;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
