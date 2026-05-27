-- 20260528b_myrology_intake_bookings.sql
-- Post-unlock surface for Myrology: birth-details intake (one row per user) and
-- session booking requests (manual confirm by the in-house astrologer).
-- Privacy-first (PV1): no name is collected — only date, time, place of birth.

BEGIN;

-- One intake per user. Birth time may be unknown (-> rectification in session 1).
CREATE TABLE IF NOT EXISTS myrology_intake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES user_profiles(id) ON DELETE CASCADE,
  dob DATE NOT NULL,
  birth_time TIME,
  birth_time_unknown BOOLEAN NOT NULL DEFAULT FALSE,
  birth_place TEXT NOT NULL,
  guidance_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session booking requests. status lifecycle is manually advanced by the astrologer.
CREATE TABLE IF NOT EXISTS myrology_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  preferred_windows TEXT NOT NULL,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'done', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_myrology_bookings_user_created
  ON myrology_bookings(user_id, created_at DESC);

ALTER TABLE myrology_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE myrology_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS myrology_intake_select_own ON myrology_intake;
CREATE POLICY myrology_intake_select_own ON myrology_intake
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS myrology_bookings_select_own ON myrology_bookings;
CREATE POLICY myrology_bookings_select_own ON myrology_bookings
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
