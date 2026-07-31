-- Role-family targeting: every populated value is the modal non-generic L2
-- cluster of the job's canonical job_skills rows.  NULL means the corpus does
-- not have enough specific skill evidence to assign a family.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS role_family TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_role_family
    ON public.jobs (role_family);

CREATE OR REPLACE FUNCTION public.role_family_for_job(p_job_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    -- Generic skills describe employability, not the work family.  Letting one
    -- win the mode would collapse unrelated postings into a false cohort.
    excluded_role_families CONSTANT TEXT[] := ARRAY[
        'Critical Thinking and Problem Solving',
        'Communication',
        'Teamwork and Collaboration',
        'Time Management',
        'Leadership'
    ];
    resolved_family TEXT;
BEGIN
    SELECT skill.l2_cluster
    INTO resolved_family
    FROM public.job_skills AS job_skill
    JOIN public.skills AS skill ON skill.id = job_skill.skill_id
    WHERE job_skill.job_id = p_job_id
      AND NULLIF(BTRIM(skill.l2_cluster), '') IS NOT NULL
      AND skill.l2_cluster <> ALL (excluded_role_families)
    GROUP BY skill.l2_cluster
    ORDER BY COUNT(*) DESC, skill.l2_cluster ASC
    LIMIT 1;

    RETURN resolved_family;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_job_role_family()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    affected_job_id TEXT;
BEGIN
    affected_job_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END;
    UPDATE public.jobs
    SET role_family = public.role_family_for_job(affected_job_id)
    WHERE job_id = affected_job_id
      AND role_family IS DISTINCT FROM public.role_family_for_job(affected_job_id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_job_role_family ON public.job_skills;
CREATE TRIGGER trg_refresh_job_role_family
AFTER INSERT OR UPDATE OR DELETE ON public.job_skills
FOR EACH ROW EXECUTE FUNCTION public.refresh_job_role_family();

-- The existing corpus is backfilled as a verified set-based operation in the
-- release runbook. New and changed listings stay current through the trigger.

CREATE OR REPLACE FUNCTION public.list_role_families(
    p_skill_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    p_query TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (
    family TEXT,
    label TEXT,
    open_count INTEGER,
    matched_skill_count INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH live_jobs AS (
        SELECT job_id, role_family, job_title
        FROM public.jobs
        WHERE role_family IS NOT NULL
          AND is_active IS TRUE
          AND listing_confidence = 'active'
    ), family_counts AS (
        SELECT role_family AS family, COUNT(*)::INTEGER AS open_count
        FROM live_jobs
        GROUP BY role_family
    ), family_matches AS (
        SELECT live.role_family AS family,
               COUNT(DISTINCT job_skill.skill_id)::INTEGER AS matched_skill_count
        FROM live_jobs AS live
        JOIN public.job_skills AS job_skill ON job_skill.job_id = live.job_id
        WHERE job_skill.skill_id = ANY(COALESCE(p_skill_ids, ARRAY[]::INTEGER[]))
        GROUP BY live.role_family
    ), cleaned_titles AS (
        SELECT role_family AS family,
               BTRIM(REGEXP_REPLACE(
                   REGEXP_REPLACE(
                       REGEXP_REPLACE(
                           REGEXP_REPLACE(job_title, '^[[:space:]]*(RB-LS:|Branch:)[[:space:]]*', '', 'i'),
                           '[[:space:]]+L[1-5][[:space:]]*$', '', 'i'
                       ),
                       '([[:space:]]*-[[:space:]]*Sales){2,}[[:space:]]*$', '', 'i'
                   ),
                   '[[:space:]]+', ' ', 'g'
               )) AS cleaned_title
        FROM live_jobs
        WHERE NULLIF(BTRIM(job_title), '') IS NOT NULL
    ), title_counts AS (
        SELECT family, cleaned_title, COUNT(*) AS title_count
        FROM cleaned_titles
        WHERE cleaned_title <> ''
        GROUP BY family, cleaned_title
    ), labels AS (
        SELECT family, cleaned_title AS label,
               ROW_NUMBER() OVER (
                   PARTITION BY family
                   ORDER BY title_count DESC, cleaned_title ASC
               ) AS label_rank
        FROM title_counts
    )
    SELECT counts.family, labels.label, counts.open_count,
           COALESCE(matches.matched_skill_count, 0) AS matched_skill_count
    FROM family_counts AS counts
    JOIN labels ON labels.family = counts.family AND labels.label_rank = 1
    LEFT JOIN family_matches AS matches ON matches.family = counts.family
    WHERE (
        NULLIF(BTRIM(p_query), '') IS NOT NULL
        AND labels.label ILIKE '%' || BTRIM(p_query) || '%'
    ) OR (
        NULLIF(BTRIM(p_query), '') IS NULL
        AND COALESCE(matches.matched_skill_count, 0) >= 1
    )
    ORDER BY COALESCE(matches.matched_skill_count, 0) DESC, counts.open_count DESC, labels.label ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 3), 50));
$$;

CREATE OR REPLACE FUNCTION public.list_role_family_locations(
    p_family TEXT,
    p_query TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
    location TEXT,
    open_count INTEGER,
    is_remote BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH live_jobs AS (
        SELECT location_city, location_mode
        FROM public.jobs
        WHERE role_family = p_family
          AND is_active IS TRUE
          AND listing_confidence = 'active'
    ), choices AS (
        SELECT location_city AS location, COUNT(*)::INTEGER AS open_count, FALSE AS is_remote
        FROM live_jobs
        WHERE NULLIF(BTRIM(location_city), '') IS NOT NULL
          AND LOWER(BTRIM(location_city)) <> 'remote'
        GROUP BY location_city
        UNION ALL
        SELECT 'Remote'::TEXT AS location, COUNT(*)::INTEGER AS open_count, TRUE AS is_remote
        FROM live_jobs
        WHERE location_mode = 'remote'
        HAVING COUNT(*) > 0
    )
    SELECT location, open_count, is_remote
    FROM choices
    WHERE NULLIF(BTRIM(p_query), '') IS NULL
       OR location ILIKE '%' || BTRIM(p_query) || '%'
    ORDER BY open_count DESC, location ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50));
$$;

CREATE OR REPLACE FUNCTION public.role_family_aspiration_skills(p_families TEXT[])
RETURNS TABLE (
    taxonomy_key TEXT,
    primary_job_count INTEGER,
    has_side_skill BOOLEAN,
    job_count INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH selected_jobs AS (
        SELECT job_id
        FROM public.jobs
        WHERE role_family = ANY(COALESCE(p_families, ARRAY[]::TEXT[]))
          AND is_active IS TRUE
          AND listing_confidence = 'active'
    ), totals AS (
        SELECT COUNT(*)::INTEGER AS job_count FROM selected_jobs
    )
    SELECT skill.taxonomy_key,
           COUNT(DISTINCT selected.job_id) FILTER (WHERE job_skill.is_primary)::INTEGER AS primary_job_count,
           BOOL_OR(NOT job_skill.is_primary) AS has_side_skill,
           totals.job_count
    FROM selected_jobs AS selected
    JOIN public.job_skills AS job_skill ON job_skill.job_id = selected.job_id
    JOIN public.skills AS skill ON skill.id = job_skill.skill_id
    CROSS JOIN totals
    GROUP BY skill.taxonomy_key, totals.job_count;
$$;

REVOKE ALL ON FUNCTION public.role_family_for_job(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_job_role_family() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_role_families(INTEGER[], TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_role_family_locations(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.role_family_aspiration_skills(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.role_family_for_job(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_role_families(INTEGER[], TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_role_family_locations(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.role_family_aspiration_skills(TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
