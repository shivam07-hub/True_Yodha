-- The level's name is derived, never stored (CONTEXT → Skill Level and Role
-- Standing). This was the one SQL writer of the column; readers left it in #345.
-- Prod's rows may still carry the key until its next merge: the record below
-- does not declare it, so it is ignored.

CREATE OR REPLACE FUNCTION public.confirm_cv_skills(
    p_user_id uuid,
    p_baseline_version_id bigint,
    p_skill_rows jsonb,
    p_overrides jsonb DEFAULT '[]'::jsonb
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        user_id, skill_id, matched_level,
        source, evidence_text, last_updated
    )
    SELECT
        p_user_id, row.skill_id, row.matched_level,
        row.source, row.evidence_text, NOW()
    FROM jsonb_to_recordset(p_skill_rows) AS row(
        skill_id BIGINT,
        matched_level INTEGER,
        source TEXT,
        evidence_text TEXT
    )
    ON CONFLICT (user_id, skill_id) DO UPDATE SET
        matched_level = EXCLUDED.matched_level,
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
$function$;
