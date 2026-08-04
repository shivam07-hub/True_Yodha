-- Look up role families by key, so a saved direction can be restored.
--
-- The onboarding journey derived "which step am I on" from facts — skills
-- confirmed, target set — which meant the only way back was to DELETE the
-- decision. Going back to step 2 therefore arrived blank, and going forward
-- again required re-picking everything (and re-running the matcher). Restoring
-- the user's actual picks needs a lookup by family key; the RPC could only
-- filter by skill overlap or a text query, and a family chosen through search
-- appears in neither.
--
-- `p_families` defaults NULL and leaves the existing predicate untouched in
-- that case, so every current 3-argument call behaves exactly as before. When
-- supplied it selects those families regardless of skill overlap — the user
-- already chose them; a low overlap is a fact about the choice, not a reason to
-- forget it.
--
-- ⚠️ The DROP below is required, not cleanup. `CREATE OR REPLACE FUNCTION` keys
-- on the ARGUMENT LIST, so adding a parameter creates an OVERLOAD rather than
-- replacing anything. With both live, every existing 3-argument call — which is
-- how PostgREST invokes this today — fails with "function ... is not unique".
-- Verified against the live database, which is shared by dev and prod.
CREATE OR REPLACE FUNCTION public.list_role_families(
    p_skill_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    p_query TEXT DEFAULT NULL::TEXT,
    p_limit INTEGER DEFAULT 3,
    p_families TEXT[] DEFAULT NULL::TEXT[]
)
RETURNS TABLE(family TEXT, label TEXT, open_count INTEGER, matched_skill_count INTEGER)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
    WHERE CASE
        WHEN p_families IS NOT NULL THEN counts.family = ANY(p_families)
        WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN labels.label ILIKE '%' || BTRIM(p_query) || '%'
        ELSE COALESCE(matches.matched_skill_count, 0) >= 1
    END
    ORDER BY COALESCE(matches.matched_skill_count, 0) DESC, counts.open_count DESC, labels.label ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 3), 50));
$function$;

-- Retire the 3-argument overload the REPLACE above left behind (see note).
DROP FUNCTION IF EXISTS public.list_role_families(INTEGER[], TEXT, INTEGER);

NOTIFY pgrst, 'reload schema';
