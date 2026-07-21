-- Trust-first listing verification.
--
-- The global oldest-first queue is necessary for eventual corpus coverage, but
-- it lets a card that a user has saved or just seen wait behind tens of
-- thousands of never-checked listings. Reserve 80% of each claim for durable
-- user-relevance signals and 20% for the corpus so both trust and coverage move.

CREATE INDEX IF NOT EXISTS idx_user_job_matches_job_id
    ON public.user_job_matches (job_id);

CREATE INDEX IF NOT EXISTS idx_job_recommendation_exposures_shown_job
    ON public.job_recommendation_exposures (shown_at DESC, job_id);

CREATE INDEX IF NOT EXISTS idx_job_listing_observations_verifier_productive
    ON public.job_listing_observations (observed_at DESC)
    WHERE observer = 'verifier'
      AND result IN ('seen_live', 'closed', 'redirected', 'wrong_role');

DROP FUNCTION IF EXISTS public.claim_verify_targets(integer, interval);

CREATE OR REPLACE FUNCTION public.claim_verify_targets(
    p_limit int DEFAULT 200,
    p_stale interval DEFAULT '7 days',
    p_priority_stale interval DEFAULT '24 hours'
)
RETURNS TABLE (
    job_id text,
    job_title text,
    apply_url text,
    listing_confidence text,
    verification_priority text
)
LANGUAGE sql
SET search_path = ''
AS $$
    WITH raw_priority AS MATERIALIZED (
        -- Explicit user intent is the strongest reason to spend a verifier slot.
        SELECT DISTINCT a.job_id, 0 AS priority_rank
        FROM public.job_applications a
        WHERE a.job_id IS NOT NULL
          AND COALESCE(a.status, '') NOT IN ('rejected', 'withdrawn', 'closed')

        UNION ALL

        -- A rendered card is a product promise even when it was not saved.
        SELECT DISTINCT e.job_id, 1 AS priority_rank
        FROM public.job_recommendation_exposures e
        WHERE e.job_id IS NOT NULL
          AND e.shown_at >= now() - interval '30 days'

        UNION ALL

        -- Precomputed matches matter, but rank behind cards a user acted on/saw.
        SELECT DISTINCT m.job_id, 2 AS priority_rank
        FROM public.user_job_matches m
        WHERE m.job_id IS NOT NULL
    ),
    priority_jobs AS MATERIALIZED (
        SELECT
            p.job_id,
            min(p.priority_rank) AS priority_rank,
            CASE min(p.priority_rank)
                WHEN 0 THEN 'tracked'
                WHEN 1 THEN 'shown'
                ELSE 'matched'
            END AS reason
        FROM raw_priority p
        GROUP BY p.job_id
    ),
    bounds AS (
        SELECT greatest(1, least(p_limit, 1000)) AS claim_limit
    ),
    priority_due AS (
        SELECT j.job_id, p.priority_rank, p.reason
        FROM public.jobs j
        JOIN priority_jobs p ON p.job_id = j.job_id
        WHERE j.retired_at IS NULL
          AND j.apply_url LIKE 'http%'
          AND (
              j.last_verification_attempt_at IS NULL
              OR j.last_verification_attempt_at < now() - p_priority_stale
          )
        ORDER BY
            p.priority_rank ASC,
            j.last_verification_attempt_at ASC NULLS FIRST
        LIMIT (SELECT greatest(1, (claim_limit * 4) / 5) FROM bounds)
        FOR UPDATE OF j SKIP LOCKED
    ),
    global_due AS (
        SELECT j.job_id, 3 AS priority_rank, 'corpus'::text AS reason
        FROM public.jobs j
        WHERE j.retired_at IS NULL
          AND j.apply_url LIKE 'http%'
          AND j.job_id NOT IN (SELECT p.job_id FROM priority_due p)
          AND (
              j.last_verification_attempt_at IS NULL
              OR j.last_verification_attempt_at < now() - p_stale
          )
        ORDER BY j.last_verification_attempt_at ASC NULLS FIRST
        LIMIT (
            SELECT greatest(0, claim_limit - (SELECT count(*) FROM priority_due))
            FROM bounds
        )
        FOR UPDATE OF j SKIP LOCKED
    ),
    due AS (
        SELECT * FROM priority_due
        UNION ALL
        SELECT * FROM global_due
    )
    UPDATE public.jobs j
       SET last_verification_attempt_at = now()
      FROM due
     WHERE j.job_id = due.job_id
    RETURNING
        j.job_id,
        j.job_title,
        j.apply_url,
        j.listing_confidence,
        due.reason;
$$;

COMMENT ON FUNCTION public.claim_verify_targets(int, interval, interval) IS
    'Atomically claims due listing checks. Reserves up to 80 percent for '
    'tracked, recently shown, and matched jobs; the remainder preserves global '
    'oldest-first progress. Returns the durable reason for audit evidence.';

CREATE OR REPLACE FUNCTION public.count_priority_verify_due(
    p_stale interval DEFAULT '24 hours'
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH priority_jobs AS (
        SELECT a.job_id
        FROM public.job_applications a
        WHERE a.job_id IS NOT NULL
          AND COALESCE(a.status, '') NOT IN ('rejected', 'withdrawn', 'closed')
        UNION
        SELECT e.job_id
        FROM public.job_recommendation_exposures e
        WHERE e.job_id IS NOT NULL
          AND e.shown_at >= now() - interval '30 days'
        UNION
        SELECT m.job_id
        FROM public.user_job_matches m
        WHERE m.job_id IS NOT NULL
    )
    SELECT count(*)
    FROM priority_jobs p
    JOIN public.jobs j ON j.job_id = p.job_id
    WHERE j.retired_at IS NULL
      AND j.apply_url LIKE 'http%'
      AND (
          j.last_verification_attempt_at IS NULL
          OR j.last_verification_attempt_at < now() - p_stale
      );
$$;

-- One always-up health read must distinguish a moving-but-useless belt from a
-- productive one. A fresh claim plus stale productive evidence is degraded.
CREATE OR REPLACE FUNCTION public.verifier_health_snapshot(
    p_priority_stale interval DEFAULT '24 hours'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'last_attempt', (
            SELECT max(j.last_verification_attempt_at)
            FROM public.jobs j
            WHERE j.apply_url LIKE 'http%'
        ),
        'last_productive', (
            SELECT max(o.observed_at)
            FROM public.job_listing_observations o
            WHERE o.observer = 'verifier'
              AND o.result IN ('seen_live', 'closed', 'redirected', 'wrong_role')
        ),
        'priority_due', public.count_priority_verify_due(p_priority_stale)
    );
$$;

REVOKE ALL ON FUNCTION public.claim_verify_targets(int, interval, interval)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_priority_verify_due(interval)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verifier_health_snapshot(interval)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_verify_targets(int, interval, interval)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.count_priority_verify_due(interval)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.verifier_health_snapshot(interval)
    TO service_role;
