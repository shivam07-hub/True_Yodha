-- The closer left a row only when it sent mail. After the quiet rule, a day
-- with no mail is the healthy case, so a closer that never started and a
-- closer that correctly stayed quiet were the same silence. This row is the
-- run itself. /health reads it; 36h without one is a stalled belt.
-- One row, service-role only, same shape as notice_digest_state.

CREATE TABLE IF NOT EXISTS notice_closer_heartbeat (
  id      BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  ran_at  TIMESTAMPTZ NOT NULL
);

ALTER TABLE notice_closer_heartbeat ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
