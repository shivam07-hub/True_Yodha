-- Location integrity contract for jobs ingestion + filtering.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS location_raw TEXT,
  ADD COLUMN IF NOT EXISTS location_city VARCHAR(200),
  ADD COLUMN IF NOT EXISTS location_country VARCHAR(200),
  ADD COLUMN IF NOT EXISTS location_mode VARCHAR(20) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS location_quality VARCHAR(20) NOT NULL DEFAULT 'unknown';

UPDATE jobs
SET location_raw = location
WHERE location_raw IS NULL
  AND location IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_location_mode_check'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_location_mode_check
      CHECK (location_mode IN ('onsite','hybrid','remote','unknown'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_location_quality_check'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_location_quality_check
      CHECK (location_quality IN ('ok','unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_location_city
  ON jobs(location_city);

CREATE INDEX IF NOT EXISTS idx_jobs_location_country
  ON jobs(location_country);

CREATE INDEX IF NOT EXISTS idx_jobs_location_mode
  ON jobs(location_mode);

CREATE TABLE IF NOT EXISTS job_feed_run_audits (
  id                     BIGSERIAL PRIMARY KEY,
  run_id                 UUID        NOT NULL UNIQUE,
  source                 VARCHAR(80) NOT NULL DEFAULT 'job_feed_importer',
  parser_version         VARCHAR(40) NOT NULL,
  total_rows             INTEGER     NOT NULL DEFAULT 0,
  unknown_location_rows  INTEGER     NOT NULL DEFAULT 0,
  unknown_location_rate  DECIMAL(6,5) NOT NULL DEFAULT 0,
  top_unknown_aliases    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status                 VARCHAR(30) NOT NULL DEFAULT 'ok',
  message                TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (unknown_location_rate >= 0 AND unknown_location_rate <= 1)
);

CREATE INDEX IF NOT EXISTS idx_job_feed_run_audits_created_at
  ON job_feed_run_audits(created_at DESC);
