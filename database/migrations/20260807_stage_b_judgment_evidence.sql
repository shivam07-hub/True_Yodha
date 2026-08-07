-- S5 prerequisite: Stage B's rows get their own name.
--
-- `skill_judgment_cli` wrote its verdicts as `evidence_source = 'enrichment'`,
-- the same value the scraper's LM Studio pass has stamped on 361,165 legacy
-- rows. `job_skills` has no timestamp, so once written, a judged row and a
-- 2026-04 scraper row were indistinguishable forever.
--
-- That is not a labelling nicety. Two things depend on telling them apart:
--
--   * The Stage B lease. `claim_jobs_for_skill_judgment` re-serves a job whose
--     claim is older than 30 minutes UNLESS a verdict landed, and
--     `release_skill_judgment_claim` refuses to release one for the same
--     reason. Both asked "does an 'enrichment' row exist". Today only 5 jobs
--     carry both a floor and a legacy scraper row, so the guard is nearly
--     always right by accident. It stops being right the moment ingest writes
--     scraper rows onto a job that also has a Stage A floor — which is exactly
--     what the forward-flow fix changes.
--   * Company demand (S5). The gating bar reads the must-have zone out of
--     `is_primary`, which means it must know which rows carry a read of the
--     document and which carry a constant. 94.2% of 'enrichment' rows say
--     is_primary; 47.1% of 'stage_a' rows do.
--
-- 'enrichment' keeps its meaning — the scraper's pass — and does not move.

ALTER TABLE public.job_skills
    DROP CONSTRAINT IF EXISTS job_skills_evidence_source_check;

ALTER TABLE public.job_skills
    ADD CONSTRAINT job_skills_evidence_source_check
    CHECK (evidence_source IN ('enrichment', 'stage_a', 'judgment', 'user_confirmed'));

-- The 191 rows Stage B has already written, on the 25 jobs it has judged.
-- Bounded and exact rather than heuristic: `jobs.skill_judged_at` is set only
-- by the Stage B claim, and the claim only ever serves a job standing on a
-- Stage A floor, so an 'enrichment' row on a claimed job is Stage B's own.
UPDATE public.job_skills AS s
SET evidence_source = 'judgment'
FROM public.jobs AS j
WHERE j.job_id = s.job_id
  AND j.skill_judged_at IS NOT NULL
  AND s.evidence_source = 'enrichment';

-- Both guards now ask the question they meant to ask: did STAGE B rule on this
-- job. A legacy scraper row can no longer answer yes on its behalf.
CREATE OR REPLACE FUNCTION public.claim_jobs_for_skill_judgment(p_limit INTEGER DEFAULT 25)
RETURNS TABLE (job_id TEXT, job_title TEXT, job_description TEXT)
LANGUAGE sql
SET search_path TO ''
AS $function$
    WITH candidates AS MATERIALIZED (
        SELECT j.job_id
        FROM public.jobs AS j
        WHERE j.has_skill_floor IS TRUE
          AND (
              j.skill_judged_at IS NULL
              OR (j.skill_judged_at < now() - interval '30 minutes'
                  AND NOT EXISTS (
                      SELECT 1 FROM public.job_skills AS done
                      WHERE done.job_id = j.job_id AND done.evidence_source = 'judgment'
                  ))
          )
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

CREATE OR REPLACE FUNCTION public.release_skill_judgment_claim(p_job_ids TEXT[])
RETURNS INTEGER
LANGUAGE sql
SET search_path TO ''
AS $function$
    WITH released AS (
        UPDATE public.jobs AS j
        SET skill_judged_at = NULL
        WHERE j.job_id = ANY(COALESCE(p_job_ids, ARRAY[]::TEXT[]))
          AND j.skill_judged_at IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.job_skills AS done
              WHERE done.job_id = j.job_id AND done.evidence_source = 'judgment'
          )
        RETURNING 1
    )
    SELECT COUNT(*)::INTEGER FROM released;
$function$;

REVOKE ALL ON FUNCTION public.claim_jobs_for_skill_judgment(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_jobs_for_skill_judgment(INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.release_skill_judgment_claim(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_skill_judgment_claim(TEXT[]) TO service_role;
