-- Extension-imported jobs were written to `jobs` but unreachable by the matcher.
-- Verified against prod 2026-08-06: all 17 rows with ingestion_source='extension'
-- had ZERO job_skills rows, NULL first_seen/last_seen, and NULL role_family.
--
-- The import path is fixed forward (job_importer.build_imported_job stamps the
-- feed markers; JobsRepository.save_imported_job writes the canonical rows).
-- This migration repairs the rows already in the corpus. Additive only:
-- INSERT ... ON CONFLICT DO NOTHING plus COALESCE-guarded updates, so it never
-- overwrites a value that already exists and is safe to re-run.
--
-- Scope is deliberately `extension` only. ~6,250 scraper rows also carry no
-- job_skills; those are the scraper's own extraction gap, not this one, and
-- their skill arrays have not been shown to be taxonomy-clean.

-- 1. Canonical skill rows from the taxonomy-validated arrays the importer stored.
--    A key present in both arrays is kept once as primary (job_skills is UNIQUE
--    on (job_id, skill_id)). Levels mirror the scraper's rows: primary 4, else 2.
--    This INSERT also fires trg_refresh_job_role_family, which is what backfills
--    jobs.role_family — that column has no other writer.
WITH labelled AS (
    SELECT job.job_id, skill.id AS skill_id, TRUE AS is_primary, 4 AS required_level
    FROM public.jobs AS job
    CROSS JOIN LATERAL unnest(COALESCE(job.main_skills, ARRAY[]::TEXT[])) AS label
    JOIN public.skills AS skill ON skill.taxonomy_key = label
    WHERE job.ingestion_source = 'extension'
    UNION ALL
    SELECT job.job_id, skill.id, FALSE, 2
    FROM public.jobs AS job
    CROSS JOIN LATERAL unnest(COALESCE(job.side_skills, ARRAY[]::TEXT[])) AS label
    JOIN public.skills AS skill ON skill.taxonomy_key = label
    WHERE job.ingestion_source = 'extension'
), picked AS (
    SELECT DISTINCT ON (job_id, skill_id) job_id, skill_id, is_primary, required_level
    FROM labelled
    ORDER BY job_id, skill_id, is_primary DESC
)
INSERT INTO public.job_skills (job_id, skill_id, is_primary, required_level)
SELECT job_id, skill_id, is_primary, required_level FROM picked
ON CONFLICT (job_id, skill_id) DO NOTHING;

-- 2. Feed markers. `batch_date` already holds the YYYYMMDD of the import day, so
--    it is the honest answer for "when did we see this" — not today's date, which
--    would claim a sighting that never happened. `ingested_at` is the fallback,
--    and reads 1970-01-01 on rows that predate that column's default.
UPDATE public.jobs
SET first_seen = COALESCE(first_seen, batch_date, (to_char(ingested_at, 'YYYYMMDD'))::INTEGER),
    last_seen  = COALESCE(last_seen,  batch_date, (to_char(ingested_at, 'YYYYMMDD'))::INTEGER)
WHERE ingestion_source = 'extension'
  AND (first_seen IS NULL OR last_seen IS NULL);

-- 3. Safety net for any imported row that already had job_skills (so step 1's
--    trigger never fired for it). NULL stays NULL when the corpus has no
--    specific-enough skill evidence — that is the documented meaning.
UPDATE public.jobs AS job
SET role_family = public.role_family_for_job(job.job_id)
WHERE job.ingestion_source = 'extension'
  AND job.role_family IS NULL
  AND public.role_family_for_job(job.job_id) IS NOT NULL;
