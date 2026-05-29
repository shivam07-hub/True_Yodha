-- 20260530c — Myrology interest opt-in (free) on user_profiles
--
-- Distinct from the paid `myrology_unlocked` entitlement. `myrology_interested`
-- is a free, user-toggled preference that controls Myrology nav visibility only.
-- Paid routes/panel stay gated by `myrology_unlocked`. Payment auto-sets
-- interested=true (see payments._unlock_myrology). Defaults false: pure opt-in.
--
-- Plan: docs/MYROLOGY_INTEREST_TOGGLE.md

BEGIN;

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS myrology_interested boolean NOT NULL DEFAULT false;

COMMIT;
