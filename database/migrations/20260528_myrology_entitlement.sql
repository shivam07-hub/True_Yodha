-- 20260528_myrology_entitlement.sql
-- Adds a second purchasable product (Myrology ₹499 one-time) on top of the
-- existing XP launch pack. billing_payments becomes a product-agnostic order
-- ledger; entitlement products (0 XP) are now allowed; myrology unlock is a
-- fast-read flag on user_profiles.

BEGIN;

-- 1. Tag every payment with the product it paid for. Existing rows are the XP pack.
ALTER TABLE billing_payments
  ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'myro_xp_launch_pack';

-- 2. Entitlement purchases earn 0 XP. Relax the strictly-positive check to >= 0.
ALTER TABLE billing_payments
  DROP CONSTRAINT IF EXISTS billing_payments_xp_amount_check;
ALTER TABLE billing_payments
  ADD CONSTRAINT billing_payments_xp_amount_check CHECK (xp_amount >= 0);

-- 3. Fast-read entitlement flag for gating the Myrology surface.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS myrology_unlocked BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

NOTIFY pgrst, 'reload schema';
