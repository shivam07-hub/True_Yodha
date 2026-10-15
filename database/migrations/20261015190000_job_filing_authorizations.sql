-- The person's Yes to file one tailored CV on one role.
-- Not an application. The browser role can read its own rows and cannot write
-- them: the API stores a row only after listing_time says confirmed_open,
-- the judge score is at least 3.5, and a tailored cv_versions row exists.
-- `applied` is a different write, and only after a company-page receipt.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_filing_authorizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    job_id text NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    cv_version_id integer NOT NULL REFERENCES public.cv_versions(id) ON DELETE RESTRICT,
    judge_score numeric NOT NULL,
    authorized_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT job_filing_authorizations_score_check CHECK (judge_score >= 3.5),
    CONSTRAINT job_filing_authorizations_user_job_unique UNIQUE (user_id, job_id)
);

ALTER TABLE public.job_filing_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_filing_authorizations_select_own
    ON public.job_filing_authorizations;
CREATE POLICY job_filing_authorizations_select_own
    ON public.job_filing_authorizations
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.job_filing_authorizations FROM authenticated, anon;
GRANT SELECT ON public.job_filing_authorizations TO authenticated;

COMMENT ON TABLE public.job_filing_authorizations IS
    'Yes to file this tailored CV. Not an application. applied is written only from a company-page receipt.';

NOTIFY pgrst, 'reload schema';

COMMIT;
