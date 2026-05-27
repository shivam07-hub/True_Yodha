-- ─────────────────────────────────────────────────────────────────────────────
-- reward_xp RPC — atomic XP grant tied to an originating row, idempotent per ref.
--
-- Mirrors charge_xp / refund_xp (migration 20260523b). Used for behavioural
-- rewards (e.g. +20 XP for adding a job to the tracker). The grant is keyed by
-- (ref_table, ref_id, action) so a retried save — or an edit of the same job —
-- never double-credits. Writes the xp_ledger row in the same transaction
-- (XP-DB3: every balance mutation is audited).
-- ─────────────────────────────────────────────────────────────────────────────

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
BEGIN
    IF p_amount <= 0 THEN
        SELECT xp_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    -- Idempotency: skip if a reward with the same (action, ref_table, ref_id)
    -- already exists. Returns the existing balance so callers stay uniform.
    SELECT count(*) INTO v_prior_count
    FROM   public.xp_ledger
    WHERE  action    = p_action
      AND  ref_table = p_ref_table
      AND  ref_id    = p_ref_id
      AND  delta     > 0;

    IF v_prior_count > 0 THEN
        SELECT xp_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    UPDATE public.user_profiles
    SET    xp_balance = xp_balance + p_amount
    WHERE  id = p_user_id
    RETURNING xp_balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RETURN NULL;  -- unknown user
    END IF;

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
