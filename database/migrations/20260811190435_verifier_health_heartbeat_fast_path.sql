-- Keep the API/verifier dead-man heartbeat cheap enough to observe an incident
-- without worsening it.
--
-- The previous snapshot called count_priority_verify_due() synchronously. That
-- count rebuilds the tracked/shown/matched priority set across three tables and
-- was measured at 26,416 shared buffers for one health read. Railway's /health
-- endpoint consequently took 8.02s during contention and returned only
-- `verifier=unknown`.
--
-- Health needs two facts: did the belt claim work recently, and did it produce a
-- useful verdict recently? Exact backlog size is operational reporting, not
-- liveness. Preserve the response key as JSON null for backward compatibility,
-- and use the existing ordered partial indexes for the two heartbeat timestamps.

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
            SELECT j.last_verification_attempt_at
            FROM public.jobs j
            WHERE j.retired_at IS NULL
              AND j.apply_url LIKE 'http%'
            ORDER BY j.last_verification_attempt_at DESC NULLS LAST
            LIMIT 1
        ),
        'last_productive', (
            SELECT o.observed_at
            FROM public.job_listing_observations o
            WHERE o.observer = 'verifier'
              AND o.result IN ('seen_live', 'closed', 'redirected', 'wrong_role')
            ORDER BY o.observed_at DESC
            LIMIT 1
        ),
        'priority_due', NULL
    );
$$;

COMMENT ON FUNCTION public.verifier_health_snapshot(interval) IS
    'Cheap verifier dead-man heartbeat. Returns latest attempt and productive '
    'verdict from ordered indexes; exact backlog counting is deliberately off '
    'the health/request path.';

REVOKE ALL ON FUNCTION public.verifier_health_snapshot(interval)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verifier_health_snapshot(interval)
    TO service_role;
