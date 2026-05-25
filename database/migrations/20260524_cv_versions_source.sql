-- 20260524 — cv_versions.source (entry-path cohort column)
--
-- ADR-0006 L7: cohort retention analysis by CV entry path. Every new
-- baseline_upload tags its source: 'pdf_upload' (file picker),
-- 'text_describe' (paste-text segment), 'linkedin_pdf' (LinkedIn Save-to-
-- PDF segment). Existing rows = NULL (unknown, pre-ADR).
--
-- Going-forward enforcement is via app code (cv_workflow.start_cv_upload_*).
-- The CHECK constraint is the safety net.

ALTER TABLE public.cv_versions
    ADD COLUMN IF NOT EXISTS source text;

DO $$ BEGIN
    ALTER TABLE public.cv_versions
        ADD CONSTRAINT cv_versions_source_chk
        CHECK (source IS NULL OR source IN ('pdf_upload', 'text_describe', 'linkedin_pdf'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cv_versions_source
    ON public.cv_versions (source)
    WHERE source IS NOT NULL;

COMMENT ON COLUMN public.cv_versions.source IS
    'ADR-0006 L7 — CV entry path. Enables retention cohort splits by upload mechanism.';

NOTIFY pgrst, 'reload schema';
