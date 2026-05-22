-- 20260522 — increment_xp_and_grant_welcome RPC
--
-- Atomic welcome-XP grant. Idempotent at the DB level: the UPDATE is gated by
-- welcome_xp_granted = FALSE, so concurrent callers cannot double-grant.
-- Returns the post-update balance (or the pre-existing balance if already granted).
--
-- Why a function (not a Python read-modify-write):
--   * Single round-trip, no read-then-write race window.
--   * welcome_xp_granted flip and xp_balance increment happen in one statement.
--   * Caller (xp_service.grant_welcome_xp) can keep its pre-check for short-circuit
--     but no longer depends on it for correctness.

CREATE OR REPLACE FUNCTION public.increment_xp_and_grant_welcome(
    p_user_id uuid,
    p_amount  integer
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH upd AS (
        UPDATE public.user_profiles
        SET xp_balance         = xp_balance + p_amount,
            welcome_xp_granted = TRUE
        WHERE id = p_user_id
          AND welcome_xp_granted = FALSE
        RETURNING xp_balance
    )
    SELECT COALESCE(
        (SELECT xp_balance FROM upd),
        (SELECT xp_balance FROM public.user_profiles WHERE id = p_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.increment_xp_and_grant_welcome(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_xp_and_grant_welcome(uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
