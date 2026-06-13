-- Reward idempotency is user-scoped for ordinary rewards. A skill-level clear
-- by one user must not suppress the same clear for every other user.
--
-- Referral signup credit remains globally single-pay because one referred
-- signup must never credit multiple referrers.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_ledger_user_reward_ref
    ON public.xp_ledger (user_id, action, ref_table, ref_id)
    WHERE delta > 0
      AND ref_table IS NOT NULL
      AND ref_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reward_xp(
    p_user_id   uuid,
    p_amount    integer,
    p_action    text,
    p_reason    text,
    p_ref_table text,
    p_ref_id    text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_balance integer;
    v_prior_count integer;
    v_lock_key text;
    v_global_referral boolean;
BEGIN
    IF p_amount <= 0 THEN
        SELECT xp_balance
        INTO v_new_balance
        FROM public.user_profiles
        WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    v_global_referral := (
        p_action = 'referral_credit'
        AND p_ref_table = 'referred_signup'
    );

    v_lock_key := concat_ws(
        E'\x1f',
        CASE WHEN v_global_referral THEN 'global' ELSE p_user_id::text END,
        COALESCE(p_action, ''),
        COALESCE(p_ref_table, ''),
        COALESCE(p_ref_id, '')
    );
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));

    SELECT xp_balance
    INTO v_new_balance
    FROM public.user_profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_new_balance IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT count(*)
    INTO v_prior_count
    FROM public.xp_ledger
    WHERE action = p_action
      AND ref_table = p_ref_table
      AND ref_id = p_ref_id
      AND delta > 0
      AND (v_global_referral OR user_id = p_user_id);

    IF v_prior_count > 0 THEN
        RETURN v_new_balance;
    END IF;

    UPDATE public.user_profiles
    SET xp_balance = xp_balance + p_amount
    WHERE id = p_user_id
    RETURNING xp_balance INTO v_new_balance;

    INSERT INTO public.xp_ledger
        (user_id, delta, balance_after, action, ref_table, ref_id, reason)
    VALUES
        (p_user_id, p_amount, v_new_balance, p_action, p_ref_table, p_ref_id, p_reason);

    RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reward_xp(uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_xp(uuid, integer, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
