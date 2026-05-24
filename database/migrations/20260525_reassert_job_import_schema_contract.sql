-- 20260525 — reassert manual job import schema contract
--
-- Railway surfaced PGRST204 for jobs.created_by_user_id even though the app
-- writes that column when saving extension/manual imports. Reassert the column
-- and reload PostgREST so the Data API cache sees the contract.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS created_by_user_id uuid
    REFERENCES public.user_profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'jobs_created_by_user_id_fkey'
          AND conrelid = 'public.jobs'::regclass
    ) THEN
        ALTER TABLE public.jobs
            ADD CONSTRAINT jobs_created_by_user_id_fkey
            FOREIGN KEY (created_by_user_id)
            REFERENCES public.user_profiles(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_created_by_user
    ON public.jobs(created_by_user_id);

COMMENT ON COLUMN public.jobs.created_by_user_id IS
    'User who created or imported this job row via Myro manual/extension import.';

NOTIFY pgrst, 'reload schema';
