-- 20260609_myrology_booking_lifecycle.sql
-- Makes the Myrology booking status lifecycle observable + auditable.
--
-- The status column + CHECK ('requested','confirmed','done','cancelled') already
-- exist (20260528b), and the user-facing surface already renders the badge — but
-- nothing ever advanced status, and there were no transition timestamps. The
-- timestamps matter beyond audit: terms §07 makes a Myrology consultation
-- refundable BEFORE delivery and non-refundable AFTER, so `done_at` is the
-- programmatic refund cutoff. Transitions are applied by the token-guarded
-- PATCH /myrology/bookings/{id}/status endpoint (service-role write).

BEGIN;

ALTER TABLE myrology_bookings
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS done_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

COMMIT;

NOTIFY pgrst, 'reload schema';
