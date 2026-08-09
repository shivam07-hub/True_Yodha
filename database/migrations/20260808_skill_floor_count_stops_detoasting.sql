-- count_jobs_missing_skill_floor: stop detoasting every job description.
--
-- PROBLEM (observed 2026-08-08, right after a 28,957-row publish)
-- `skill_floor_cli --apply` calls this metric before it drains. It began
-- failing with `57014 canceling statement due to statement timeout`, so the
-- drain never started — it stalled at ~1,200 of ~13,900 jobs, leaving the rest
-- invisible to the matcher.
--
-- The `awaiting_stage_a` filter was written as
--
--     NULLIF(btrim(COALESCE(job.job_description, '')), '') IS NOT NULL
--
-- `btrim` needs the whole value, so this fully detoasts `job_description` for
-- every row matching `has_skill_floor IS FALSE` — roughly 386 MB of TOAST reads
-- to produce one integer.
--
-- It is self-defeating: the drain evicts a meaningful slice of the buffer cache
-- (the CLI docstring says so), so the *next* pass runs this count cold and
-- exceeds the budget. `service_role` inherits `authenticator`'s
-- statement_timeout of 8s and sets no override, so cold is fatal.
--
-- MEASURED (EXPLAIN ANALYZE, warm):
--     before: Buffers shared hit=49404   477 ms
--     after:  Buffers shared hit=4709 read=237   267 ms
--
-- BEHAVIOUR CHANGE, stated plainly: a job whose description is present but
-- entirely whitespace now counts toward `awaiting_stage_a` instead of being
-- excluded. That is a metric-only difference — it does not change which jobs the
-- drain writes a floor for — and a whitespace-only description is not a state
-- the scraper produces (`writer.to_canonical` substitutes MISSING_JD_NOTE below
-- MIN_JOB_DESCRIPTION_LEN).

BEGIN;

CREATE OR REPLACE FUNCTION public.count_jobs_missing_skill_floor()
RETURNS TABLE (total INTEGER, recommendable INTEGER, awaiting_stage_a INTEGER)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT COUNT(*)::INTEGER AS total,
           COUNT(*) FILTER (
               WHERE job.is_active IS TRUE AND job.listing_confidence = 'active'
           )::INTEGER AS recommendable,
           COUNT(*) FILTER (
               WHERE job.skill_floor_attempted_at IS NULL
                 AND job.job_description IS NOT NULL
           )::INTEGER AS awaiting_stage_a
    FROM public.jobs AS job
    WHERE job.has_skill_floor IS FALSE;
$function$;

COMMIT;
