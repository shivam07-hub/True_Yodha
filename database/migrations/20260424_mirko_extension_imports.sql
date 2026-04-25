-- Mirko Chrome extension job imports
-- Adds source metadata to jobs and tracks unmapped/emerging skills as first-class demand signals.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS ingestion_source VARCHAR(30) NOT NULL DEFAULT 'scraper',
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(80),
  ADD COLUMN IF NOT EXISTS quality_status VARCHAR(30) NOT NULL DEFAULT 'auto_extracted',
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE TABLE IF NOT EXISTS job_skill_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  raw_label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  skill_type VARCHAR(20) NOT NULL CHECK (skill_type IN ('primary', 'secondary')),
  source VARCHAR(30) NOT NULL CHECK (source IN ('user_added', 'llm_suggested', 'page_extracted')),
  source_platform VARCHAR(80),
  confidence DECIMAL(3,2) CHECK (confidence BETWEEN 0 AND 1),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapped_skill_id INTEGER REFERENCES skills(id),
  status VARCHAR(30) NOT NULL DEFAULT 'unmapped'
    CHECK (status IN ('unmapped', 'mapped', 'rejected', 'promoted_custom')),
  UNIQUE(job_id, normalized_label, skill_type)
);

CREATE INDEX IF NOT EXISTS idx_jobs_ingestion_source ON jobs(ingestion_source);
CREATE INDEX IF NOT EXISTS idx_jobs_source_platform ON jobs(source_platform);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by_user ON jobs(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_job_skill_candidates_label ON job_skill_candidates(normalized_label);
CREATE INDEX IF NOT EXISTS idx_job_skill_candidates_status ON job_skill_candidates(status);
CREATE INDEX IF NOT EXISTS idx_job_skill_candidates_job ON job_skill_candidates(job_id);
