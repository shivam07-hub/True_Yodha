-- Keep explicit verifier diagnostics, but make them read the same narrow
-- schedule/interest models as the worker. They are no longer part of the
-- health request path; this also makes an operator's manual check cheap.

CREATE OR REPLACE FUNCTION public.count_verify_due(
    p_stale interval DEFAULT '7 days'
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT count(*)
    FROM public.job_verification_schedule s
    WHERE s.last_attempt_at IS NULL
       OR s.last_attempt_at < now() - p_stale;
$$;

CREATE OR REPLACE FUNCTION public.count_priority_verify_due(
    p_stale interval DEFAULT '24 hours'
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT count(*)
    FROM public.job_verification_interest i
    JOIN public.job_verification_schedule s ON s.job_id = i.job_id
    WHERE (i.application_tracked OR i.shown_until >= now() OR i.matched)
      AND (s.last_attempt_at IS NULL OR s.last_attempt_at < now() - p_stale);
$$;

CREATE OR REPLACE FUNCTION public.verifier_last_attempt()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT s.last_attempt_at
    FROM public.job_verification_schedule s
    ORDER BY s.last_attempt_at DESC NULLS LAST
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.verifier_health_snapshot(
    p_priority_stale interval DEFAULT '24 hours'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'last_attempt', public.verifier_last_attempt(),
        'last_productive', (
            SELECT o.observed_at
            FROM public.job_listing_observations o
            WHERE o.observer = 'verifier'
              AND o.result IN ('seen_live', 'closed', 'redirected', 'wrong_role')
            ORDER BY o.observed_at DESC
            LIMIT 1
        ),
        -- Exact priority backlog is an explicit operations diagnostic, not a
        -- health dependency. Keep health constant-time.
        'priority_due', NULL
    );
$$;

REVOKE ALL ON FUNCTION public.count_verify_due(interval)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_priority_verify_due(interval)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verifier_last_attempt()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verifier_health_snapshot(interval)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.count_verify_due(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_priority_verify_due(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.verifier_last_attempt() TO service_role;
GRANT EXECUTE ON FUNCTION public.verifier_health_snapshot(interval) TO service_role;

NOTIFY pgrst, 'reload schema';
