-- Dead-man signal for the listing-verification belt.
--
-- The belt died in prod on ~2026-07-17 and nothing paged for four days. A log
-- metric emitted BY the sweep cannot detect the sweep not running, so the
-- heartbeat has to be readable from a process that is always up (the API).
--
-- No new table: `last_verification_attempt_at` already IS the heartbeat — the
-- claim RPC stamps it every batch. This function just reads its high-water mark
-- under the same predicate as idx_jobs_verify_due, so it resolves as an index
-- scan backward rather than a 47k-row seq scan.

CREATE OR REPLACE FUNCTION public.verifier_last_attempt()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
    SELECT max(j.last_verification_attempt_at)
    FROM public.jobs j
    WHERE j.retired_at IS NULL
      AND j.apply_url LIKE 'http%';
$$;

COMMENT ON FUNCTION public.verifier_last_attempt() IS
    'High-water mark of verification claims — the belt heartbeat. Read by the '
    'API dead-man check; a stale value means no sweep is running.';

REVOKE ALL ON FUNCTION public.verifier_last_attempt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verifier_last_attempt() TO service_role;
