-- Operator Notice ledger (CONTEXT.md). Service-role only.
-- RLS with no policies = users cannot read or write; closer and prod API use service role.

CREATE TABLE IF NOT EXISTS notices (
  cause_key            TEXT PRIMARY KEY,
  cause_class          TEXT NOT NULL,
  status               TEXT NOT NULL,
  occurrence_count     INTEGER NOT NULL DEFAULT 1,
  first_seen_at        TIMESTAMPTZ NOT NULL,
  last_seen_at         TIMESTAMPTZ NOT NULL,
  last_method          TEXT NOT NULL DEFAULT '',
  last_path            TEXT NOT NULL DEFAULT '',
  last_correlation_id  TEXT NOT NULL DEFAULT '',
  closing_commit       TEXT,
  blocked_reason       TEXT,
  proof_test           TEXT
);

CREATE INDEX IF NOT EXISTS idx_notices_status_last_seen
  ON notices (status, last_seen_at DESC);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
