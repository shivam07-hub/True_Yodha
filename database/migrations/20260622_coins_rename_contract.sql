-- 20260622 — "XP → Myro Coins" rename · PHASE 2 of 2: CONTRACT (destructive, flips authority)
--
-- Backlog #31 / #25 PR3. Companion to 20260616_coins_rename_expand.sql.
--
-- THE EXPAND migration added coin_* GENERATED read-aliases over the authoritative
-- xp_* layer and coin_* wrapper RPCs delegating to charge_xp/refund_xp/reward_xp.
-- All app code has since cut over to the coin_* names (PR2, 309a993). This file
-- flips authority: it DROPS the generated aliases, RENAMES the physical xp_*
-- columns / xp_ledger table to coin_*, and rewrites every dependent function so
-- coin_balance / coin_ledger / *_coins_granted become the single source of truth.
-- After this, the xp_* names no longer exist.
--
-- ── DESTRUCTIVE + LOCKSTEP-DEPLOY. Read before applying: ─────────────────────────
-- Renaming xp_balance → coin_balance means any process still issuing a literal
-- `UPDATE user_profiles SET xp_balance=…` (or selecting welcome_xp_granted /
-- linkedin_xp_granted) ERRORS the instant this commits. The matching backend
-- (this PR's xp_service / user_provisioning / users / upskilling edits) writes
-- coin_* and MUST be deployed in lockstep. Reads were already coin_* (the
-- generated aliases) so SELECTs are unaffected — only the direct-write paths
-- (earn / spend / spend_to_floor / linkedin grant) and the two ledger-table
-- reads break in the gap. charge/refund/welcome go through RPCs whose names are
-- preserved, so they keep working across the window.
--
--   APPLY RUNBOOK (off-peak):
--     1. Pre-flight straggler scan (must return ONLY the 6 known xp fns below;
--        if anything else appears — e.g. a dashboard-authored fn — rewrite it
--        into this migration before applying):
--          SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--          WHERE n.nspname='public'
--            AND (prosrc ILIKE '%xp_balance%' OR prosrc ILIKE '%xp_ledger%'
--                 OR prosrc ILIKE '%xp_granted%');
--        Expected: charge_xp, grant_welcome_xp_on_user_profile_insert,
--        increment_xp_and_grant_welcome, log_welcome_xp_to_ledger, refund_xp,
--        reward_xp. (Verified against live prod 2026-06-22.)
--     2. Apply this SQL.
--     3. Immediately redeploy mirror-backend-prod (the lockstep backend). The
--        gap is the redeploy window (~1–2 min) — keep it off-peak.
--     4. NOTIFY pgrst (runs at the tail of this file) reloads the API schema.
--
-- NOT renamed (deliberately, correctness-only scope — these never break and
-- carry no "xp" data-authority meaning): the internal Python identifiers
-- (xp_service.py, earn_xp/spend_xp/get_xp_balance, XPBalanceResponse, the
-- /users/me/xp route), the wire field linkedin_xp_granted, the kept DB fn names
-- increment_xp_and_grant_welcome / grant_welcome_xp_on_user_profile_insert /
-- log_welcome_xp_to_ledger / sweep_stale_cv_upload_jobs (callers reference them),
-- and cv_upload_jobs.xp_charged (a per-job charge amount, out of #31 scope).

BEGIN;

-- ── 1. Drop the EXPAND-phase generated read-aliases (they block the rename) ──────
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS coin_balance;
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS welcome_coins_granted;
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS linkedin_coins_granted;

-- ── 2. Drop the EXPAND-phase view + wrapper RPCs (recreated below as real fns) ───
DROP VIEW IF EXISTS public.coin_ledger;
DROP FUNCTION IF EXISTS public.charge_coins(uuid, integer, text, integer, text, text);
DROP FUNCTION IF EXISTS public.refund_coins(uuid, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.reward_coins(uuid, integer, text, text, text, text);

-- ── 3. Rename the physical columns xp_* → coin_* (data preserved in place) ────────
ALTER TABLE public.user_profiles RENAME COLUMN xp_balance         TO coin_balance;
ALTER TABLE public.user_profiles RENAME COLUMN welcome_xp_granted  TO welcome_coins_granted;
ALTER TABLE public.user_profiles RENAME COLUMN linkedin_xp_granted TO linkedin_coins_granted;

COMMENT ON COLUMN public.user_profiles.coin_balance IS
    'Myro Coins balance. Authoritative (CONTRACT phase — xp_balance removed).';

-- ── 4. Rename the ledger table + its indexes + RLS policy ────────────────────────
ALTER TABLE public.xp_ledger RENAME TO coin_ledger;
ALTER INDEX  public.xp_ledger_pkey                    RENAME TO coin_ledger_pkey;
ALTER INDEX  public.idx_xp_ledger_user_created        RENAME TO idx_coin_ledger_user_created;
ALTER INDEX  public.idx_xp_ledger_ref                 RENAME TO idx_coin_ledger_ref;
ALTER INDEX  public.uq_xp_ledger_user_reward_ref      RENAME TO uq_coin_ledger_user_reward_ref;
ALTER INDEX  public.uq_xp_ledger_referral_signup_reward RENAME TO uq_coin_ledger_referral_signup_reward;
ALTER POLICY xp_ledger_select_own ON public.coin_ledger RENAME TO coin_ledger_select_own;

COMMENT ON TABLE public.coin_ledger IS
    'Append-only Myro Coins audit log. Every charge/refund/grant writes a row.';

-- ── 5. Recreate the atomic mutation RPCs as REAL coin-named fns (coin_* bodies) ──
-- charge_coins — atomic floor-gated deduction (was charge_xp, migration 20260523b).
CREATE OR REPLACE FUNCTION public.charge_coins(
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
        SELECT coin_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    UPDATE public.user_profiles
    SET    coin_balance = coin_balance - p_amount
    WHERE  id = p_user_id
      AND  coin_balance - p_amount >= p_floor
    RETURNING coin_balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RETURN NULL;  -- caller: balance too low for this floor
    END IF;

    INSERT INTO public.coin_ledger
        (user_id, delta, balance_after, action, ref_table, ref_id)
    VALUES
        (p_user_id, -p_amount, v_new_balance, p_action, p_ref_table, p_ref_id);

    RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_coins(uuid, integer, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_coins(uuid, integer, text, integer, text, text) TO service_role;

-- refund_coins — atomic credit, idempotent on (ref_table, ref_id) (was refund_xp).
CREATE OR REPLACE FUNCTION public.refund_coins(
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
        SELECT coin_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    SELECT count(*) INTO v_prior_refund_count
    FROM   public.coin_ledger
    WHERE  ref_table = p_ref_table
      AND  ref_id    = p_ref_id
      AND  delta     > 0
      AND  action    LIKE 'refund_%';

    IF v_prior_refund_count > 0 THEN
        SELECT coin_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
        RETURN v_new_balance;
    END IF;

    UPDATE public.user_profiles
    SET    coin_balance = coin_balance + p_amount
    WHERE  id = p_user_id
    RETURNING coin_balance INTO v_new_balance;

    INSERT INTO public.coin_ledger
        (user_id, delta, balance_after, action, ref_table, ref_id, reason)
    VALUES
        (p_user_id, p_amount, v_new_balance, 'refund_' || p_action, p_ref_table, p_ref_id, p_reason);

    RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_coins(uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_coins(uuid, integer, text, text, text, text) TO service_role;

-- reward_coins — behavioural grant, user-scoped idempotency + global-referral
-- single-pay (was reward_xp, latest body migration 20260613_reward_xp_user_scope).
CREATE OR REPLACE FUNCTION public.reward_coins(
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
        SELECT coin_balance INTO v_new_balance FROM public.user_profiles WHERE id = p_user_id;
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

    SELECT coin_balance INTO v_new_balance
    FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;

    IF v_new_balance IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT count(*) INTO v_prior_count
    FROM public.coin_ledger
    WHERE action = p_action
      AND ref_table = p_ref_table
      AND ref_id = p_ref_id
      AND delta > 0
      AND (v_global_referral OR user_id = p_user_id);

    IF v_prior_count > 0 THEN
        RETURN v_new_balance;
    END IF;

    UPDATE public.user_profiles
    SET coin_balance = coin_balance + p_amount
    WHERE id = p_user_id
    RETURNING coin_balance INTO v_new_balance;

    INSERT INTO public.coin_ledger
        (user_id, delta, balance_after, action, ref_table, ref_id, reason)
    VALUES
        (p_user_id, p_amount, v_new_balance, p_action, p_ref_table, p_ref_id, p_reason);

    RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reward_coins(uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_coins(uuid, integer, text, text, text, text) TO service_role;

-- ── 6. Rewrite kept-name fns to target coin_* (names preserved — callers depend) ─
-- Welcome grant RPC (XP-DB1 atomicity; name kept — xp_service calls it).
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
        SET coin_balance          = coin_balance + p_amount,
            welcome_coins_granted = TRUE
        WHERE id = p_user_id
          AND welcome_coins_granted = FALSE
        RETURNING coin_balance
    )
    SELECT COALESCE(
        (SELECT coin_balance FROM upd),
        (SELECT coin_balance FROM public.user_profiles WHERE id = p_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.increment_xp_and_grant_welcome(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_xp_and_grant_welcome(uuid, integer) TO service_role;

-- BEFORE INSERT welcome grant trigger fn (XP-DB1; name kept — trigger binds it).
CREATE OR REPLACE FUNCTION public.grant_welcome_xp_on_user_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.welcome_coins_granted IS NOT TRUE THEN
        NEW.coin_balance          := COALESCE(NEW.coin_balance, 0) + 3000;
        NEW.welcome_coins_granted := TRUE;
    END IF;
    RETURN NEW;
END;
$$;

-- AFTER INSERT welcome-grant ledger writer (name kept — trigger binds it).
CREATE OR REPLACE FUNCTION public.log_welcome_xp_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.welcome_coins_granted IS TRUE AND NEW.coin_balance >= 3000 THEN
        INSERT INTO public.coin_ledger (user_id, delta, balance_after, action, reason)
        VALUES (NEW.id, 3000, NEW.coin_balance, 'welcome', 'Signup welcome grant');
    END IF;
    RETURN NEW;
END;
$$;

-- Orphan-sweep RPC now refunds via refund_coins (name kept — app + startup call it).
CREATE OR REPLACE FUNCTION public.sweep_stale_cv_upload_jobs(p_minutes integer DEFAULT 5)
RETURNS TABLE (job_id uuid, swept_user_id uuid, refunded_amount integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stale_job record;
BEGIN
    FOR stale_job IN
        SELECT c.id, c.user_id, c.xp_charged
        FROM   public.cv_upload_jobs AS c
        WHERE  c.status = 'processing'
          AND  c.created_at < now() - (p_minutes || ' minutes')::interval
        ORDER BY c.created_at
        LIMIT 200
    LOOP
        UPDATE public.cv_upload_jobs AS c
        SET    status       = 'failed',
               error_code   = 'orphaned',
               error_detail = 'Job exceeded ' || p_minutes ||
                              ' min in processing - server restart or stuck worker.',
               xp_refunded  = true,
               finished_at  = now()
        WHERE  c.id = stale_job.id
          AND  c.status = 'processing';

        IF FOUND THEN
            IF COALESCE(stale_job.xp_charged, 0) > 0 THEN
                PERFORM public.refund_coins(
                    stale_job.user_id,
                    stale_job.xp_charged,
                    'cv_upload',
                    'orphaned_sweep',
                    'cv_upload_jobs',
                    stale_job.id::text
                );
            END IF;

            job_id := stale_job.id;
            swept_user_id := stale_job.user_id;
            refunded_amount := COALESCE(stale_job.xp_charged, 0);
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stale_cv_upload_jobs(integer) TO service_role;

-- ── 7. Drop the now-orphaned xp_* mutation fns (nothing references them) ──────────
DROP FUNCTION IF EXISTS public.charge_xp(uuid, integer, text, integer, text, text);
DROP FUNCTION IF EXISTS public.refund_xp(uuid, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.reward_xp(uuid, integer, text, text, text, text);

COMMIT;

NOTIFY pgrst, 'reload schema';
