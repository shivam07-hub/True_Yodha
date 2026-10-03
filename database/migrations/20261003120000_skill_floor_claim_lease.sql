-- Stage A's claim becomes a lease; its attempt column becomes a verdict.
--
-- `claim_jobs_for_skill_floor` stamped `skill_floor_attempted_at` at CLAIM
-- time, before a single skill was written. A drain killed mid-batch therefore
-- left up to 100 jobs marked "attempted" with no floor, and from then on they
-- were indistinguishable from jobs Stage A had read and found nothing in: out
-- of Stage A's work set for good, invisible to the matcher. On 2026-09-30 the
-- 14k-job drain hit its 2h RQ timeout twice (18:56, 20:58 UTC) and stranded
-- 96 and 37 jobs exactly that way. A deploy restarting the worker does the same.
--
-- Now the claim stamps `skill_floor_claimed_at` (a lease), and
-- `skill_floor_attempted_at` is written by `settle_skill_floor_claims` only
-- after the batch's skills have landed. A lease with no verdict is claimable
-- again by anyone after 15 minutes, and AT ONCE by its own owner: RQ retries a
-- killed drain within seconds under the same scrape run id, and that retry must
-- finish the batch it was killed in, not wait out its own lease.
-- `skill_floor_attempted_at` keeps its meaning for every reader — "Stage A has
-- run on this job" — it simply becomes true.
--
-- A NEW claim function, not a redefinition: the running worker keeps calling
-- the old name with the old semantics until the deploy that reads this lands,
-- so no window exists where a claim is stamped and nothing settles it. The old
-- function is dropped once that deploy is live.

BEGIN;

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS skill_floor_claimed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS skill_floor_claimed_by TEXT;

COMMENT ON COLUMN public.jobs.skill_floor_claimed_at IS
    'Stage A lease. Set by claim_skill_floor_lease; a claim older than 15 minutes with no skill_floor_attempted_at is claimable again.';
COMMENT ON COLUMN public.jobs.skill_floor_claimed_by IS
    'Stage A lease owner (the scrape run id). The same owner may reclaim its own unsettled lease at once.';

CREATE OR REPLACE FUNCTION public.claim_skill_floor_lease(
    p_limit INTEGER DEFAULT 100,
    p_owner TEXT DEFAULT NULL
)
RETURNS TABLE(job_id TEXT, job_title TEXT, job_description TEXT)
LANGUAGE sql
SET search_path TO ''
AS $function$
    WITH candidates AS MATERIALIZED (
        SELECT j.job_id
        FROM public.jobs AS j
        WHERE j.has_skill_floor IS FALSE
          AND j.skill_floor_attempted_at IS NULL
          AND j.job_description IS NOT NULL
          AND (
              j.skill_floor_claimed_at IS NULL
              OR j.skill_floor_claimed_at < now() - interval '15 minutes'
              OR j.skill_floor_claimed_by = p_owner
          )
        ORDER BY j.job_id
        FOR UPDATE SKIP LOCKED
        LIMIT greatest(1, least(p_limit, 500))
    ), claimed AS (
        UPDATE public.jobs AS j
        SET skill_floor_claimed_at = now(),
            skill_floor_claimed_by = p_owner
        FROM candidates AS c
        WHERE j.job_id = c.job_id
        RETURNING j.job_id, j.job_title, j.job_description
    )
    SELECT c.job_id, c.job_title, c.job_description FROM claimed AS c;
$function$;

REVOKE ALL ON FUNCTION public.claim_skill_floor_lease(INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_skill_floor_lease(INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_skill_floor_claims(p_job_ids TEXT[])
RETURNS INTEGER
LANGUAGE sql
SET search_path TO ''
AS $function$
    WITH settled AS (
        UPDATE public.jobs AS j
        SET skill_floor_attempted_at = now()
        WHERE j.job_id = ANY(p_job_ids)
          AND j.skill_floor_attempted_at IS NULL
        RETURNING 1
    )
    SELECT count(*)::INTEGER FROM settled;
$function$;

REVOKE ALL ON FUNCTION public.settle_skill_floor_claims(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_skill_floor_claims(TEXT[]) TO service_role;

COMMIT;
