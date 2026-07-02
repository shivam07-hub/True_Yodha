-- 20260702b — cv_application_attempts (CVJT1 submitted-CV snapshot, journey 5.2)
--
-- One immutable row per Apply: the exact tailored CV the user submitted, frozen
-- against the job. Ties the tailoring effort to the application it was for and
-- gives an honest submission history (multiple attempts per job allowed). Own-only
-- (RLS); append-only — NO update policy, because a submission is a historical fact.
--
-- job_id is stored as text (not FK) to match the app's string job_id and avoid
-- coupling to the jobs PK type. cv_version_id is nullable (the active tailored
-- version when known). cv_snapshot holds { text, score, title, company, ... }.
--
-- Manual-apply (feedback_supabase_migrations_manual) — run via Supabase MCP
-- apply_migration BEFORE deploying the apply-snapshot router.

CREATE TABLE IF NOT EXISTS public.cv_application_attempts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id        text NOT NULL,
    cv_version_id integer,
    cv_snapshot   jsonb NOT NULL,
    applied_url   text,
    submitted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_application_attempts_user_job
    ON public.cv_application_attempts (user_id, job_id, submitted_at DESC);

ALTER TABLE public.cv_application_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY cv_application_attempts_own_select ON public.cv_application_attempts
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY cv_application_attempts_own_insert ON public.cv_application_attempts
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Intentionally NO update/delete policy: attempts are immutable history.

COMMENT ON TABLE public.cv_application_attempts IS
    'Immutable submitted-CV snapshots per Apply (CVJT1). Append-only, RLS own-only.';

NOTIFY pgrst, 'reload schema';
