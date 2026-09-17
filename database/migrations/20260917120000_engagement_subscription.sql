-- ₹199 / month Personalised Engagement (ENG1).
-- Additive: subscription columns, unbounded monthly passes, billing
-- subscription id. Reversible: drop the new columns / restore the two checks.
-- Apply on the shared Supabase, then NOTIFY pgrst, 'reload schema'.

BEGIN;

ALTER TABLE job_switch_plans
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active';

ALTER TABLE job_switch_plans
  DROP CONSTRAINT IF EXISTS job_switch_plans_reviews_used_chk;

ALTER TABLE job_switch_plans
  ADD CONSTRAINT job_switch_plans_reviews_used_chk CHECK (reviews_used >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS job_switch_plans_razorpay_subscription_id_uidx
  ON job_switch_plans (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

ALTER TABLE job_switch_plan_reviews
  DROP CONSTRAINT IF EXISTS job_switch_plan_reviews_no_chk;

ALTER TABLE billing_payments
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;

CREATE INDEX IF NOT EXISTS billing_payments_razorpay_subscription_id_idx
  ON billing_payments (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
