-- The Notice digest sent every day whether or not anything had changed: one
-- mail a day saying the same thing, which is how a mailbox stops being read.
-- This holds the fingerprint of the open set the last SENT digest described,
-- so the closer can send only when something opened, closed, or changed state
-- (plus a Monday heartbeat, so a quiet week is distinguishable from a dead
-- Action). One row, service-role only, same as `notices`.

CREATE TABLE IF NOT EXISTS notice_digest_state (
  id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  fingerprint  TEXT NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL
);

ALTER TABLE notice_digest_state ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
