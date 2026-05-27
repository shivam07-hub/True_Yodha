-- 20260527 — institution_applications (placement-cell lead capture)
--
-- Backs POST /institutions/apply from the new /signup/institutions dual-mode
-- page. T&P officers / deans / career-services apply for the beta cohort.
-- Insert path is service-role only (router uses get_supabase_admin), mirroring
-- user_feedback. RLS is ON with no public policy → deny-by-default for anon/
-- authenticated clients; the service role bypasses RLS for the insert.

CREATE TABLE IF NOT EXISTS public.institution_applications (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    institute_name    text NOT NULL,
    contact_name      text NOT NULL,
    contact_title     text NOT NULL,
    email             text NOT NULL,
    institute_type    text NOT NULL,
    students_per_year text NOT NULL,
    primary_need      text,
    sso_provider      text,                              -- 'google-edu' | 'microsoft-edu' | NULL (manual apply)
    status            text NOT NULL DEFAULT 'received',
    source            text NOT NULL DEFAULT 'signup_institutions',
    created_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE public.institution_applications
        ADD CONSTRAINT institution_applications_status_chk
        CHECK (status IN ('received', 'reviewing', 'pilot', 'rejected', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lead-pipeline browse: newest first.
CREATE INDEX IF NOT EXISTS idx_institution_applications_created_at
    ON public.institution_applications (created_at DESC);

-- Surface duplicate applications from the same institute domain during review.
CREATE INDEX IF NOT EXISTS idx_institution_applications_email
    ON public.institution_applications (lower(email));

ALTER TABLE public.institution_applications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.institution_applications IS
    'Placement-cell beta applications from /signup/institutions. Service-role insert only; RLS deny-by-default for client roles.';

NOTIFY pgrst, 'reload schema';
