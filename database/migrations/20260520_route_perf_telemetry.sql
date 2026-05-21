-- Route performance telemetry events.
-- Written by the /v1/telemetry/route-perf endpoint (service-role client).
-- RLS enabled with no policies = service-role only; users cannot read or write directly.

CREATE TABLE IF NOT EXISTS route_perf_events (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route            TEXT            NOT NULL,
  ttfa_ms          INTEGER,
  tti_cc_ms        INTEGER,
  cls              DOUBLE PRECISION,
  deploy_id        TEXT,
  backend_version  TEXT,
  viewport         TEXT,
  session_id       TEXT,
  occurred_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_perf_events_route_occurred
  ON route_perf_events (route, occurred_at);

ALTER TABLE route_perf_events ENABLE ROW LEVEL SECURITY;
