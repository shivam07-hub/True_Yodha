-- Durable, proof-first onboarding state and trustworthy match invariants.

BEGIN;

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS target_role_title TEXT,
    ADD COLUMN IF NOT EXISTS target_seniority TEXT;

ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_target_seniority_chk;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_target_seniority_chk CHECK (
        target_seniority IS NULL OR target_seniority IN (
            'intern', 'entry', 'mid', 'senior', 'lead', 'executive', 'any'
        )
    );

CREATE TABLE IF NOT EXISTS public.user_onboarding_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'analyzing', 'result_ready', 'completed')),
    current_stage TEXT NOT NULL DEFAULT 'experience'
        CHECK (current_stage IN ('experience', 'target', 'result', 'generator')),
    entry_mode TEXT
        CHECK (entry_mode IS NULL OR entry_mode IN ('uploaded_cv', 'description')),
    upload_job_id UUID REFERENCES public.cv_upload_jobs(id) ON DELETE SET NULL,
    accepted_file_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_text TEXT,
    preview_payload JSONB,
    generator_step SMALLINT NOT NULL DEFAULT 1
        CHECK (generator_step BETWEEN 1 AND 5),
    generator_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_draft TEXT,
    result_seen_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    activation_kind TEXT,
    checklist_dismissed_at TIMESTAMPTZ,
    score_gap_reviewed_at TIMESTAMPTZ,
    credible_job_saved_at TIMESTAMPTZ,
    tailored_cv_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_state_status
    ON public.user_onboarding_state (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_state_upload_job
    ON public.user_onboarding_state (upload_job_id)
    WHERE upload_job_id IS NOT NULL;

ALTER TABLE public.user_onboarding_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_onboarding_state_select_own
    ON public.user_onboarding_state;
CREATE POLICY user_onboarding_state_select_own
    ON public.user_onboarding_state
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::BOOLEAN, FALSE) = FALSE
    );

REVOKE ALL ON public.user_onboarding_state FROM anon, authenticated;
GRANT SELECT ON public.user_onboarding_state TO authenticated;
GRANT ALL ON public.user_onboarding_state TO service_role;

CREATE TABLE IF NOT EXISTS public.cv_skill_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    baseline_version_id INTEGER NOT NULL
        REFERENCES public.cv_versions(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('include', 'exclude')),
    evidence_text TEXT NOT NULL,
    source_location JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, baseline_version_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_cv_skill_overrides_user_baseline
    ON public.cv_skill_overrides (user_id, baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_cv_skill_overrides_baseline
    ON public.cv_skill_overrides (baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_cv_skill_overrides_skill
    ON public.cv_skill_overrides (skill_id);

ALTER TABLE public.cv_skill_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cv_skill_overrides_select_own
    ON public.cv_skill_overrides;
CREATE POLICY cv_skill_overrides_select_own
    ON public.cv_skill_overrides
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::BOOLEAN, FALSE) = FALSE
    );

REVOKE ALL ON public.cv_skill_overrides FROM anon, authenticated;
GRANT SELECT ON public.cv_skill_overrides TO authenticated;
GRANT ALL ON public.cv_skill_overrides TO service_role;

ALTER TABLE public.cv_versions
    DROP CONSTRAINT IF EXISTS cv_versions_source_chk;
ALTER TABLE public.cv_versions
    ADD CONSTRAINT cv_versions_source_chk CHECK (
        source IS NULL OR source IN (
            'pdf_upload', 'text_describe', 'linkedin_pdf', 'generated_baseline'
        )
    );

ALTER TABLE public.cv_upload_jobs
    ADD COLUMN IF NOT EXISTS analysis_kind TEXT NOT NULL DEFAULT 'baseline',
    ADD COLUMN IF NOT EXISTS result_payload JSONB,
    ADD COLUMN IF NOT EXISTS baseline_version_id INTEGER
        REFERENCES public.cv_versions(id) ON DELETE SET NULL;

ALTER TABLE public.cv_upload_jobs
    DROP CONSTRAINT IF EXISTS cv_upload_jobs_analysis_kind_chk;
ALTER TABLE public.cv_upload_jobs
    ADD CONSTRAINT cv_upload_jobs_analysis_kind_chk CHECK (
        analysis_kind IN ('baseline', 'profile_preview', 'generated_baseline')
    );

CREATE INDEX IF NOT EXISTS idx_cv_upload_jobs_baseline_version
    ON public.cv_upload_jobs (baseline_version_id)
    WHERE baseline_version_id IS NOT NULL;

ALTER TABLE public.user_job_matches
    ADD COLUMN IF NOT EXISTS baseline_version_id INTEGER
        REFERENCES public.cv_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS target_context_hash TEXT,
    ADD COLUMN IF NOT EXISTS seniority_compatibility TEXT;

ALTER TABLE public.user_job_matches
    DROP CONSTRAINT IF EXISTS user_job_matches_seniority_compatibility_chk;
ALTER TABLE public.user_job_matches
    ADD CONSTRAINT user_job_matches_seniority_compatibility_chk CHECK (
        seniority_compatibility IS NULL OR seniority_compatibility IN (
            'compatible', 'incompatible', 'unknown'
        )
    );

UPDATE public.user_job_matches
SET recommendation = 'Skip', is_recommended = FALSE
WHERE overall_score < 3.5;

UPDATE public.user_job_matches
SET is_recommended = FALSE
WHERE is_recommended IS TRUE
  AND (
      overall_score IS NULL
      OR overall_score < 3.5
      OR recommendation NOT IN ('Apply', 'Negotiate')
      OR seniority_compatibility IS DISTINCT FROM 'compatible'
  );

ALTER TABLE public.user_job_matches
    DROP CONSTRAINT IF EXISTS user_job_matches_low_score_skip_chk;
ALTER TABLE public.user_job_matches
    ADD CONSTRAINT user_job_matches_low_score_skip_chk CHECK (
        overall_score IS NULL
        OR overall_score >= 3.5
        OR recommendation = 'Skip'
    );

ALTER TABLE public.user_job_matches
    DROP CONSTRAINT IF EXISTS user_job_matches_recommended_credible_chk;
ALTER TABLE public.user_job_matches
    ADD CONSTRAINT user_job_matches_recommended_credible_chk CHECK (
        is_recommended IS NOT TRUE
        OR (
            overall_score >= 3.5
            AND recommendation IN ('Apply', 'Negotiate')
            AND seniority_compatibility = 'compatible'
        )
    );

CREATE INDEX IF NOT EXISTS idx_user_job_matches_current_context
    ON public.user_job_matches (
        user_id, baseline_version_id, target_context_hash, is_recommended
    );
CREATE INDEX IF NOT EXISTS idx_user_job_matches_baseline_version
    ON public.user_job_matches (baseline_version_id)
    WHERE baseline_version_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
