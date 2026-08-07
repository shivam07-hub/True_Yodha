-- S2: Stage B's work set and its own attempt column.
--
-- Same ownership contract as Stage A (20260806e), for the same reasons. The
-- work SET is "jobs standing on a deterministic floor", which
-- `job_skills.evidence_source = 'stage_a'` already records exactly. Stage B
-- writes ONLY `skill_judged_at`; `enrichment_status` stays the enrichment
-- pipeline's alone.
--
-- COST NOTE, and this is a repeat offence worth reading before editing the
-- claim. The first version of this function filtered on
-- `NULLIF(btrim(job_description),'') IS NOT NULL`, which TOAST-reads a
-- ~3,600-char column for all 61,280 candidate rows: 94.6 seconds and ~285,000
-- shared buffers, cancelled by statement_timeout (57014). 93.7s of that was the
-- predicate alone. 20260806e had already removed exactly this predicate from
-- `job_ids_missing_skill_floor` for exactly this reason, and it came straight
-- back three hours later.
--
-- Whether a job has usable text is decided in Python, after the claimed rows
-- are fetched by primary key. Returning the column for 25 rows is free;
-- filtering on it across the corpus is not. Measured after the fix: 193ms,
-- Heap Fetches 0.
--
-- A claimed job whose text yields nothing is stamped and not retried. That is
-- correct — Stage B looked, and there was nothing to judge. It does not touch
-- the floor, so the job stays exactly as matchable as Stage A left it.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS skill_judged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_awaiting_judgment
    ON public.jobs (job_id)
    WHERE skill_judged_at IS NULL AND has_skill_floor IS TRUE;

CREATE OR REPLACE FUNCTION public.claim_jobs_for_skill_judgment(p_limit INTEGER DEFAULT 25)
RETURNS TABLE (job_id TEXT, job_title TEXT, job_description TEXT)
LANGUAGE sql
SET search_path TO ''
AS $function$
    WITH candidates AS MATERIALIZED (
        SELECT j.job_id
        FROM public.jobs AS j
        WHERE j.skill_judged_at IS NULL
          AND j.has_skill_floor IS TRUE
          AND EXISTS (
              SELECT 1 FROM public.job_skills AS s
              WHERE s.job_id = j.job_id AND s.evidence_source = 'stage_a'
          )
        ORDER BY j.job_id
        FOR UPDATE SKIP LOCKED
        LIMIT greatest(1, least(p_limit, 200))
    ), claimed AS (
        UPDATE public.jobs AS j
        SET skill_judged_at = now()
        FROM candidates AS c
        WHERE j.job_id = c.job_id
        RETURNING j.job_id, j.job_title, j.job_description
    )
    SELECT c.job_id, c.job_title, c.job_description FROM claimed AS c;
$function$;

CREATE OR REPLACE FUNCTION public.count_jobs_awaiting_judgment()
RETURNS TABLE (total INTEGER, recommendable INTEGER)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER,
           COUNT(*) FILTER (
               WHERE job.is_active IS TRUE AND job.listing_confidence = 'active'
           )::INTEGER
    FROM public.jobs AS job
    WHERE job.skill_judged_at IS NULL AND job.has_skill_floor IS TRUE;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs_for_skill_judgment(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_jobs_awaiting_judgment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_jobs_for_skill_judgment(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_jobs_awaiting_judgment() TO service_role;
