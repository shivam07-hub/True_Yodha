-- PR-REFERRAL-V1 backend.
-- Manual apply only: Shivam applies this to the shared Supabase project.
--
-- Reconciles the checked-in 20260528 reward_xp migration with the live
-- database, where the RPC is currently absent. The advisory transaction lock
-- serializes identical reward keys before the ledger check, making concurrent
-- replays pay exactly once.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_ledger_referral_signup_reward
    ON public.xp_ledger (action, ref_table, ref_id)
    WHERE delta > 0
      AND action = 'referral_credit'
      AND ref_table = 'referred_signup'
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
BEGIN
    IF p_amount <= 0 THEN
        SELECT xp_balance
        INTO v_new_balance
        FROM public.user_profiles
        WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    v_lock_key := concat_ws(
        E'\x1f',
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
      AND delta > 0;

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

-- Verify after manual apply:
-- SELECT to_regprocedure('public.reward_xp(uuid,integer,text,text,text,text)');
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname = 'uq_xp_ledger_referral_signup_reward';
