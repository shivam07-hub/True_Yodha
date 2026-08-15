-- Keep the Stage A work queue and its dead-man metric on exactly one predicate.
--
-- The 20260808 count optimization intentionally stopped trimming descriptions
-- because detoasting the no-floor corpus exceeded the API statement timeout.
-- It therefore counts every non-NULL description. The claim RPC still rejected
-- empty/whitespace descriptions, leaving two legacy rows permanently visible to
-- the monitor but impossible for a worker to claim. Claim those rows too: title
-- extraction may still find a floor, and an empty Stage A result is a legitimate
-- attempt that belongs in Stage B's separate backlog.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_jobs_for_skill_floor(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (job_id TEXT, job_title TEXT, job_description TEXT)
LANGUAGE sql
SET search_path TO ''
AS $function$
    WITH candidates AS MATERIALIZED (
        SELECT j.job_id
        FROM public.jobs AS j
        WHERE j.has_skill_floor IS FALSE
          AND j.skill_floor_attempted_at IS NULL
          AND j.job_description IS NOT NULL
        ORDER BY j.job_id
        FOR UPDATE SKIP LOCKED
        LIMIT greatest(1, least(p_limit, 500))
    ), claimed AS (
        UPDATE public.jobs AS j
        SET skill_floor_attempted_at = now()
        FROM candidates AS c
        WHERE j.job_id = c.job_id
        RETURNING j.job_id, j.job_title, j.job_description
    )
    SELECT c.job_id, c.job_title, c.job_description FROM claimed AS c;
$function$;

REVOKE ALL ON FUNCTION public.claim_jobs_for_skill_floor(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_jobs_for_skill_floor(INTEGER) TO service_role;

COMMIT;
