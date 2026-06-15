-- 20260616 — "XP → Myro Coins" rename · PHASE 1 of 2: EXPAND (additive, reversible)
--
-- Backlog #25 step-2. Renames the internal currency from "xp" to "coins" using a
-- two-phase expand/contract migration so the live app never sees a flag-day break.
--
-- THIS FILE = EXPAND. It is purely ADDITIVE: it introduces coin_* aliases that
-- always mirror the authoritative xp_* layer. NOTHING is renamed or dropped here.
-- The old xp_balance column / xp_ledger table / charge_xp|refund_xp|reward_xp RPCs
-- remain the single source of truth. New code can begin reading/calling the coin_*
-- names; old code keeps working unchanged. Safe to apply on prod with traffic live.
--
-- The companion CONTRACT migration (20260xxx_coins_rename_contract.sql) runs only
-- AFTER every consumer has cut over to coin_* AND a stability soak has passed. It
-- flips authority to coin_* and drops the xp_* aliases. Do NOT apply contract early.
--
-- Apply: run this SQL on Supabase, then it self-runs `NOTIFY pgrst, 'reload schema'`.

-- ── 1. Read-alias columns (GENERATED — auto-sync, cannot drift, read-only) ───────
-- A generated column always equals its source on every write, with no trigger and
-- no split-brain risk. New code READS coin_balance; all WRITES still target the
-- authoritative xp_balance (directly or via the wrapper RPCs below).
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS coin_balance integer
        GENERATED ALWAYS AS (xp_balance) STORED;

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS welcome_coins_granted boolean
        GENERATED ALWAYS AS (welcome_xp_granted) STORED;

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS linkedin_coins_granted boolean
        GENERATED ALWAYS AS (linkedin_xp_granted) STORED;

COMMENT ON COLUMN public.user_profiles.coin_balance IS
    'Myro Coins balance. EXPAND-phase read-alias of xp_balance (authoritative until CONTRACT).';

-- ── 2. Ledger read-alias view (respects the underlying RLS) ──────────────────────
-- security_invoker=true => the view runs with the querying user''s rights, so the
-- xp_ledger "select own" RLS policy still applies through coin_ledger.
CREATE OR REPLACE VIEW public.coin_ledger
    WITH (security_invoker = true)
    AS SELECT * FROM public.xp_ledger;

COMMENT ON VIEW public.coin_ledger IS
    'Myro Coins ledger. EXPAND-phase read-alias of xp_ledger (authoritative until CONTRACT).';

-- ── 3. Wrapper RPCs — delegate to the existing functions (one source of truth) ───
-- New code calls charge_coins / refund_coins / reward_coins. Each simply forwards
-- to the locked xp_* function (XP-DB1..4), so atomicity, the row lock, ledger
-- write, floor check, and double-refund / single-pay idempotency are inherited
-- verbatim. No logic is duplicated.
CREATE OR REPLACE FUNCTION public.charge_coins(
    p_user_id   uuid,
    p_amount    integer,
    p_action    text,
    p_floor     integer DEFAULT 0,
    p_ref_table text DEFAULT NULL,
    p_ref_id    text DEFAULT NULL
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.charge_xp(p_user_id, p_amount, p_action, p_floor, p_ref_table, p_ref_id);
$$;

REVOKE ALL ON FUNCTION public.charge_coins(uuid, integer, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_coins(uuid, integer, text, integer, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_coins(
    p_user_id   uuid,
    p_amount    integer,
    p_action    text,
    p_reason    text,
    p_ref_table text,
    p_ref_id    text
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.refund_xp(p_user_id, p_amount, p_action, p_reason, p_ref_table, p_ref_id);
$$;

REVOKE ALL ON FUNCTION public.refund_coins(uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_coins(uuid, integer, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reward_coins(
    p_user_id   uuid,
    p_amount    integer,
    p_action    text,
    p_reason    text,
    p_ref_table text,
    p_ref_id    text
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.reward_xp(p_user_id, p_amount, p_action, p_reason, p_ref_table, p_ref_id);
$$;

REVOKE ALL ON FUNCTION public.reward_coins(uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_coins(uuid, integer, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
