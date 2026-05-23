-- 20260523b — XP ledger + DB-enforced welcome grant + atomic charge/refund RPCs
--
-- Closes long-term gaps identified in ADR-0004 phase-1 review:
--   1. Welcome XP grant moves from Python to a BEFORE INSERT trigger.
--      No deploy gap can leave a user un-granted. No race. No future code
--      path can skip it.
--   2. Charge / refund become single-statement RPCs with row locks, so two
--      concurrent uploads cannot both pass the "balance >= cost" check.
--   3. Every balance mutation writes an xp_ledger row — append-only audit
--      trail keyed by (action, ref_table, ref_id) for dispute traceability
--      and double-refund detection.

-- ── 1. xp_ledger ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xp_ledger (
    id           bigserial PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    delta        integer NOT NULL,                       -- positive=credit, negative=charge
    balance_after integer NOT NULL,                      -- snapshot post-mutation
    action       text NOT NULL,                          -- 'cv_upload', 'welcome', 'forge_session', etc
    ref_table    text,                                   -- 'cv_upload_jobs', 'forge_sessions', etc
    ref_id       text,                                   -- id of the referenced row (UUID or int as text)
    reason       text,                                   -- free-form (refund reason, manual note)
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_user_created
    ON public.xp_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_ref
    ON public.xp_ledger (ref_table, ref_id)
    WHERE ref_table IS NOT NULL;

ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xp_ledger_select_own ON public.xp_ledger;
CREATE POLICY xp_ledger_select_own
    ON public.xp_ledger
    FOR SELECT
    USING (auth.uid() = user_id);

COMMENT ON TABLE  public.xp_ledger IS 'Append-only XP audit log. Every charge/refund/grant writes a row.';
COMMENT ON COLUMN public.xp_ledger.delta IS 'Signed amount. Positive credits, negative charges.';

-- ── 2. Backfill ledger with one historical snapshot per user ─────────────────
-- One-time bootstrap: each existing user_profile gets a "snapshot" row recording
-- their current balance so the ledger sums to current_balance after this point.
INSERT INTO public.xp_ledger (user_id, delta, balance_after, action, reason)
SELECT
    id,
    xp_balance,
    xp_balance,
    'historical_snapshot',
    'Ledger bootstrap — pre-ledger balance frozen at 20260523b migration'
FROM public.user_profiles
WHERE NOT EXISTS (
    SELECT 1 FROM public.xp_ledger l WHERE l.user_id = user_profiles.id
);

-- ── 3. Welcome XP grant trigger on user_profiles ─────────────────────────────
-- BEFORE INSERT so the row is born with the grant. Idempotent via
-- welcome_xp_granted flag (caller can pre-set it to bypass — useful for
-- test fixtures or service-owned rows).
CREATE OR REPLACE FUNCTION public.grant_welcome_xp_on_user_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.welcome_xp_granted IS NOT TRUE THEN
        NEW.xp_balance := COALESCE(NEW.xp_balance, 0) + 3000;
        NEW.welcome_xp_granted := TRUE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_welcome_xp ON public.user_profiles;
CREATE TRIGGER user_profiles_welcome_xp
    BEFORE INSERT ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.grant_welcome_xp_on_user_profile_insert();

-- Companion AFTER INSERT trigger writes the grant to the ledger.
CREATE OR REPLACE FUNCTION public.log_welcome_xp_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.welcome_xp_granted IS TRUE AND NEW.xp_balance >= 3000 THEN
        -- Only log if the row was actually born from the welcome grant
        -- (xp_balance==3000 OR triggered via the BEFORE handler). Cheap
        -- heuristic — false positives just create an extra audit row.
        INSERT INTO public.xp_ledger (user_id, delta, balance_after, action, reason)
        VALUES (NEW.id, 3000, NEW.xp_balance, 'welcome', 'Signup welcome grant');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_welcome_xp_ledger ON public.user_profiles;
CREATE TRIGGER user_profiles_welcome_xp_ledger
    AFTER INSERT ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.log_welcome_xp_to_ledger();

-- ── 4. charge_xp RPC — atomic single-statement deduction with row lock ───────
-- Returns the post-charge balance on success. Returns NULL if floor would be
-- breached (caller maps NULL → HTTP 400). Writes a ledger row in the same tx.
CREATE OR REPLACE FUNCTION public.charge_xp(
    p_user_id   uuid,
    p_amount    integer,
    p_action    text,
    p_floor     integer DEFAULT 0,
    p_ref_table text DEFAULT NULL,
    p_ref_id    text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_balance integer;
BEGIN
    IF p_amount <= 0 THEN
        SELECT xp_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    UPDATE public.user_profiles
    SET    xp_balance = xp_balance - p_amount
    WHERE  id = p_user_id
      AND  xp_balance - p_amount >= p_floor
    RETURNING xp_balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RETURN NULL;  -- caller: balance too low for this floor
    END IF;

    INSERT INTO public.xp_ledger
        (user_id, delta, balance_after, action, ref_table, ref_id)
    VALUES
        (p_user_id, -p_amount, v_new_balance, p_action, p_ref_table, p_ref_id);

    RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_xp(uuid, integer, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_xp(uuid, integer, text, integer, text, text) TO service_role;

-- ── 5. refund_xp RPC — atomic credit with double-refund protection ───────────
-- Looks up prior refund for the same (ref_table, ref_id, action='refund') and
-- returns the existing balance if found. Otherwise credits + logs.
CREATE OR REPLACE FUNCTION public.refund_xp(
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
    v_prior_refund_count integer;
BEGIN
    IF p_amount <= 0 THEN
        SELECT xp_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    -- Idempotency: skip if a refund for this (ref_table, ref_id) already exists.
    SELECT count(*) INTO v_prior_refund_count
    FROM   public.xp_ledger
    WHERE  ref_table = p_ref_table
      AND  ref_id    = p_ref_id
      AND  delta     > 0
      AND  action    LIKE 'refund_%';

    IF v_prior_refund_count > 0 THEN
        SELECT xp_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    UPDATE public.user_profiles
    SET    xp_balance = xp_balance + p_amount
    WHERE  id = p_user_id
    RETURNING xp_balance INTO v_new_balance;

    INSERT INTO public.xp_ledger
        (user_id, delta, balance_after, action, ref_table, ref_id, reason)
    VALUES
        (p_user_id, p_amount, v_new_balance, 'refund_' || p_action, p_ref_table, p_ref_id, p_reason);

    RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_xp(uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_xp(uuid, integer, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
