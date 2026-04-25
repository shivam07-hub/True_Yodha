-- Job Path Lite: tracked-job targets, milestones, and CV variants.

ALTER TABLE job_applications
  DROP CONSTRAINT IF EXISTS job_applications_status_check;

ALTER TABLE job_applications
  ADD CONSTRAINT job_applications_status_check
  CHECK (status IN ('pending','applied','no_response','responded','interviewing','rejected','offer','abandoned'));

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS followed_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_received_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS job_application_skill_targets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id      TEXT        NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  skill       VARCHAR(200) NOT NULL,
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, job_id, skill)
);

CREATE TABLE IF NOT EXISTS job_application_milestones (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id         TEXT        NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  milestone_date DATE        NOT NULL,
  skill          VARCHAR(200) NOT NULL,
  is_primary     BOOLEAN     NOT NULL DEFAULT FALSE,
  template_id    VARCHAR(80),
  title          TEXT        NOT NULL,
  action         TEXT        NOT NULL,
  proof_prompt   TEXT,
  impact_prompt  TEXT,
  proof          TEXT,
  impact         TEXT,
  confidence     DECIMAL(3,2) NOT NULL DEFAULT 0.60 CHECK (confidence BETWEEN 0 AND 1),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id, milestone_date)
);

CREATE TABLE IF NOT EXISTS job_cv_variants (
  id                SERIAL      PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id            TEXT        NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  cv_version_number INTEGER     NOT NULL DEFAULT 1,
  confidence_label  VARCHAR(40) NOT NULL,
  deterministic_text TEXT       NOT NULL,
  polished_text     TEXT,
  snapshot_hash     VARCHAR(64) NOT NULL,
  proof_count       INTEGER     NOT NULL DEFAULT 0,
  ai_polished       BOOLEAN     NOT NULL DEFAULT FALSE,
  ai_polish_used_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id, snapshot_hash)
);

CREATE INDEX IF NOT EXISTS idx_job_path_targets_user_job
  ON job_application_skill_targets(user_id, job_id);

CREATE INDEX IF NOT EXISTS idx_job_path_milestones_user_job_date
  ON job_application_milestones(user_id, job_id, milestone_date);

CREATE INDEX IF NOT EXISTS idx_job_cv_variants_user_job
  ON job_cv_variants(user_id, job_id, created_at DESC);

ALTER TABLE job_application_skill_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_application_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cv_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own job path targets" ON job_application_skill_targets;
DROP POLICY IF EXISTS "own job path milestones" ON job_application_milestones;
DROP POLICY IF EXISTS "own job cv variants" ON job_cv_variants;

CREATE POLICY "own job path targets"
  ON job_application_skill_targets FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "own job path milestones"
  ON job_application_milestones FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "own job cv variants"
  ON job_cv_variants FOR ALL
  USING (auth.uid() = user_id);
