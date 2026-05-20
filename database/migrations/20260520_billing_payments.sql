-- 20260520_billing_payments.sql
-- Razorpay checkout payment records for idempotent XP purchases.

BEGIN;

CREATE TABLE IF NOT EXISTS billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 100),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  receipt TEXT NOT NULL,
  xp_amount INTEGER NOT NULL CHECK (xp_amount > 0),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'verified')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_user_created
  ON billing_payments(user_id, created_at DESC);

ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_payments_select_own ON billing_payments;
CREATE POLICY billing_payments_select_own
  ON billing_payments
  FOR SELECT
  USING (auth.uid() = user_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
