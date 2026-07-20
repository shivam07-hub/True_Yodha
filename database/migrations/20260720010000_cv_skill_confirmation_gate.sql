-- A baseline's extracted skills are candidates until the owner confirms them.
-- Existing baselines predate this gate and retain their already-visible state.

ALTER TABLE public.cv_versions
    ADD COLUMN IF NOT EXISTS skills_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS skills_confirmed_at TIMESTAMPTZ;

UPDATE public.cv_versions
SET skills_confirmed_at = COALESCE(created_at, NOW())
WHERE kind = 'baseline_upload'
  AND skills_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_versions_pending_skill_confirmation
    ON public.cv_versions (user_id, created_at DESC)
    WHERE kind = 'baseline_upload' AND skills_confirmed_at IS NULL;

COMMENT ON COLUMN public.cv_versions.skills_detected IS
    'Baseline-scoped extraction candidates; not canonical user skills until confirmed.';
COMMENT ON COLUMN public.cv_versions.skills_confirmed_at IS
    'Trust gate: score and job matching must not use this baseline while NULL.';

CREATE OR REPLACE FUNCTION public.confirm_cv_skills(
    p_user_id UUID,
    p_baseline_version_id BIGINT,
    p_skill_rows JSONB,
    p_overrides JSONB DEFAULT '[]'::jsonb
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_confirmed_at TIMESTAMPTZ;
BEGIN
    UPDATE public.cv_versions
    SET skills_confirmed_at = COALESCE(skills_confirmed_at, NOW())
    WHERE id = p_baseline_version_id
      AND user_id = p_user_id
      AND kind = 'baseline_upload'
    RETURNING skills_confirmed_at INTO v_confirmed_at;

    IF v_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'Baseline CV not found';
    END IF;

    DELETE FROM public.user_skills
    WHERE user_id = p_user_id
      AND source IN ('cv', 'user_override');

    INSERT INTO public.user_skills (
        user_id, skill_id, matched_level, proficiency_title,
        source, evidence_text, last_updated
    )
    SELECT
        p_user_id, row.skill_id, row.matched_level, row.proficiency_title,
        row.source, row.evidence_text, NOW()
    FROM jsonb_to_recordset(p_skill_rows) AS row(
        skill_id BIGINT,
        matched_level INTEGER,
        proficiency_title TEXT,
        source TEXT,
        evidence_text TEXT
    )
    ON CONFLICT (user_id, skill_id) DO UPDATE SET
        matched_level = EXCLUDED.matched_level,
        proficiency_title = EXCLUDED.proficiency_title,
        source = EXCLUDED.source,
        evidence_text = EXCLUDED.evidence_text,
        last_updated = EXCLUDED.last_updated;

    DELETE FROM public.cv_skill_overrides
    WHERE user_id = p_user_id
      AND baseline_version_id = p_baseline_version_id;

    INSERT INTO public.cv_skill_overrides (
        user_id, baseline_version_id, skill_id, action,
        evidence_text, source_location
    )
    SELECT
        p_user_id, p_baseline_version_id, row.skill_id, row.action,
        row.evidence_text, row.source_location
    FROM jsonb_to_recordset(p_overrides) AS row(
        skill_id BIGINT,
        action TEXT,
        evidence_text TEXT,
        source_location JSONB
    );

    RETURN v_confirmed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cv_skills(UUID, BIGINT, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_cv_skills(UUID, BIGINT, JSONB, JSONB)
    TO service_role;
