-- 20260417_job_id_text.sql
-- Align user_job_matches.job_id and job_applications.job_id with jobs.job_id (text).
-- Reason: the original int4 columns assumed a legacy job_postings table with
-- auto-increment IDs. That table no longer exists. public.jobs uses hex text IDs.

BEGIN;

-- 1. Drop orphan data — 10 rows in user_job_matches point to non-existent jobs,
--    1 row in job_applications is test data.
TRUNCATE public.user_job_matches CASCADE;
TRUNCATE public.job_applications CASCADE;

-- 2. Alter column types
ALTER TABLE public.user_job_matches
    ALTER COLUMN job_id TYPE text USING job_id::text;

ALTER TABLE public.job_applications
    ALTER COLUMN job_id TYPE text USING job_id::text;

-- 3. Add foreign keys
ALTER TABLE public.user_job_matches
    ADD CONSTRAINT user_job_matches_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES public.jobs(job_id) ON DELETE CASCADE;

ALTER TABLE public.job_applications
    ADD CONSTRAINT job_applications_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES public.jobs(job_id) ON DELETE CASCADE;

-- 4. Unique indexes for upsert on_conflict paths
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_job_matches_unique
    ON public.user_job_matches (user_id, job_id, batch_week);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_applications_unique
    ON public.job_applications (user_id, job_id);

-- 5. Add matched_skills JSONB column for job-card skill chips
ALTER TABLE public.user_job_matches
    ADD COLUMN IF NOT EXISTS matched_skills jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
