-- The Stage A skill floor: one work set, one lifecycle owner, one attempt column.
--
-- Stage A is the deterministic taxonomy pass that guarantees no job exists
-- without skills (see SKILL_ENGINE.md). It needs to answer "which jobs still
-- have none" cheaply and repeatedly, without becoming a second, disagreeing
-- definition of work alongside the enrichment pipeline's.
--
-- OWNERSHIP CONTRACT, and every clause of it was paid for:
--
--   * The work SET is `jobs.has_skill_floor`, maintained by the SAME trigger on
--     job_skills that already maintains `role_family` — so the cost is one
--     UPDATE per skill-row change doing two derivations, not two triggers.
--     Nothing may re-derive this from an anti-join. Computing it live over 62k
--     jobs x 376k skill rows exceeds Supabase's SERVER-side statement_timeout
--     (57014) no matter what the client timeout is, and PostgREST silently
--     truncates every response at 1,000 rows, so a partial work list is
--     indistinguishable from a finished one. Reading this boolean is ~2ms.
--
--   * The work LIFECYCLE stays owned solely by `enrichment_status`. Stage A
--     never writes it. A pre-processor that claims through the enrichment
--     pipeline's own status column is two owners of one column, and releasing a
--     job Stage A could not read to `not_applicable` removed it from Stage B's
--     queue on the strength of a weaker method's failure — "Stage A found
--     nothing" is not "nothing is findable".
--
--   * Stage A owns exactly one column: `skill_floor_attempted_at`. That is the
--     whole of its authority, and it is the same split the listing verifier
--     keeps between `last_verification_attempt_at` and `listing_confidence`.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS has_skill_floor BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS skill_floor_attempted_at TIMESTAMPTZ;

-- Partial indexes: the only questions asked are "which jobs lack a floor" (the
-- monitor) and "which of those has Stage A not tried yet" (the claim). Both
-- sets should stay small, so indexing only the false side keeps them small.
CREATE INDEX IF NOT EXISTS idx_jobs_missing_skill_floor
    ON public.jobs (job_id)
    WHERE has_skill_floor IS FALSE;

CREATE INDEX IF NOT EXISTS idx_jobs_skill_floor_pending
    ON public.jobs (job_id)
    WHERE has_skill_floor IS FALSE AND skill_floor_attempted_at IS NULL;

-- One trigger, two derived columns. Extends 20260731_job_role_family.
CREATE OR REPLACE FUNCTION public.refresh_job_role_family()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    affected_job_id TEXT;
    resolved_family TEXT;
    has_floor BOOLEAN;
BEGIN
    affected_job_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END;
    resolved_family := public.role_family_for_job(affected_job_id);
    has_floor := EXISTS (
        SELECT 1 FROM public.job_skills WHERE job_id = affected_job_id
    );

    UPDATE public.jobs
    SET role_family = resolved_family,
        has_skill_floor = has_floor
    WHERE job_id = affected_job_id
      AND (role_family IS DISTINCT FROM resolved_family
           OR has_skill_floor IS DISTINCT FROM has_floor);
    RETURN NULL;
END;
$$;

-- Seed the derived column once, server-side, where no web-role statement
-- timeout applies. Safe to re-run.
UPDATE public.jobs AS job
SET has_skill_floor = EXISTS (
    SELECT 1 FROM public.job_skills AS skill WHERE skill.job_id = job.job_id
)
WHERE job.has_skill_floor IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.job_skills AS skill WHERE skill.job_id = job.job_id
);

-- Stage A's claim. FOR UPDATE SKIP LOCKED so one row is served to one worker,
-- bounded, and the attempt is stamped in the statement that selects — a worker
-- that dies mid-batch cannot make those jobs invisible, because the floor
-- itself is still missing and the monitor still counts them.
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
          AND NULLIF(btrim(COALESCE(j.job_description, '')), '') IS NOT NULL
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

-- The dead-man's read. It has to separate a STALL from a BACKLOG, or it cries
-- wolf from the day it ships and gets muted — which destroys the only thing it
-- is for.
--
--   awaiting_stage_a  no floor and never attempted. Rising means the pipeline
--                     is not running. THIS is the absence-of-signal to alert on.
--   total             includes jobs Stage A has already tried and legitimately
--                     found no taxonomy skill in — short summary blurbs waiting
--                     on Stage B's judgment pass. A known backlog, not an alarm.
--   recommendable     of the total, the ones a user could actually be matched
--                     to. A closed listing with no skills harms nobody.
DROP FUNCTION IF EXISTS public.count_jobs_missing_skill_floor();

CREATE FUNCTION public.count_jobs_missing_skill_floor()
RETURNS TABLE (total INTEGER, recommendable INTEGER, awaiting_stage_a INTEGER)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER AS total,
           COUNT(*) FILTER (
               WHERE job.is_active IS TRUE AND job.listing_confidence = 'active'
           )::INTEGER AS recommendable,
           COUNT(*) FILTER (
               WHERE job.skill_floor_attempted_at IS NULL
                 AND NULLIF(btrim(COALESCE(job.job_description, '')), '') IS NOT NULL
           )::INTEGER AS awaiting_stage_a
    FROM public.jobs AS job
    WHERE job.has_skill_floor IS FALSE;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs_for_skill_floor(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_jobs_missing_skill_floor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_jobs_for_skill_floor(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_jobs_missing_skill_floor() TO service_role;
