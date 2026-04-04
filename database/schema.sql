-- ============================================================
-- MIRROR APP — Database Schema v2.0
-- Apply in Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── SKILL TAXONOMY ─────────────────────────────────────────

CREATE TABLE skill_domains (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(10)  NOT NULL UNIQUE,  -- SD, DE, DSA, AML, CDO, CS, QAT, EA, PPM, UX
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE skill_families (
  id        SERIAL PRIMARY KEY,
  domain_id INTEGER     NOT NULL REFERENCES skill_domains(id),
  code      VARCHAR(20) NOT NULL UNIQUE,
  name      VARCHAR(100) NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE skills (
  id                 SERIAL PRIMARY KEY,
  domain_id          INTEGER      NOT NULL REFERENCES skill_domains(id),
  family_id          INTEGER      NOT NULL REFERENCES skill_families(id),
  taxonomy_key       VARCHAR(200) NOT NULL UNIQUE,
  display_name       VARCHAR(200) NOT NULL,
  demand_trend       VARCHAR(20)  DEFAULT 'stable',
  technology_aliases TEXT[]       DEFAULT '{}',
  is_active          BOOLEAN      DEFAULT TRUE,
  sort_order         INTEGER      DEFAULT 0,
  created_at         TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE skill_levels (
  id          SERIAL PRIMARY KEY,
  skill_id    INTEGER     NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level       INTEGER     NOT NULL CHECK (level BETWEEN 1 AND 5),
  label       VARCHAR(20) NOT NULL,
  description TEXT        NOT NULL,
  xp_min      INTEGER     NOT NULL,
  xp_max      INTEGER,
  UNIQUE(skill_id, level)
);

-- ─── USERS ──────────────────────────────────────────────────

CREATE TABLE user_profiles (
  id                  UUID         PRIMARY KEY,
  email               VARCHAR(255) UNIQUE NOT NULL,
  full_name           VARCHAR(255),
  linkedin_url        VARCHAR(500),
  target_roles        TEXT[]       DEFAULT '{}',
  target_location     VARCHAR(200),
  cv_url              VARCHAR(500),
  cv_parsed_at        TIMESTAMPTZ,
  onboarding_complete BOOLEAN      DEFAULT FALSE,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  last_active_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── SKILL XP ───────────────────────────────────────────────

CREATE TABLE user_skill_xp (
  id               SERIAL       PRIMARY KEY,
  user_id          UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skill_id         INTEGER      NOT NULL REFERENCES skills(id),
  xp               INTEGER      NOT NULL DEFAULT 0,
  inferred_level   INTEGER      NOT NULL DEFAULT 0 CHECK (inferred_level BETWEEN 0 AND 5),
  source           VARCHAR(30)  DEFAULT 'cv',
  confidence       DECIMAL(3,2) DEFAULT 0.5,
  evidence_signals JSONB        DEFAULT '[]',
  last_updated     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

-- ─── MIRROR SCORES ──────────────────────────────────────────

CREATE TABLE mirror_scores (
  id               SERIAL        PRIMARY KEY,
  user_id          UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  total_score      DECIMAL(5,2)  NOT NULL,
  domain_scores    JSONB         NOT NULL DEFAULT '{}',
  skill_scores     JSONB         NOT NULL DEFAULT '{}',
  gap_skills       JSONB         NOT NULL DEFAULT '[]',
  -- rank_tier and percentile: INTERNAL ONLY — never expose via API
  rank_tier        VARCHAR(30),
  percentile       DECIMAL(5,2),
  skills_assessed  INTEGER       NOT NULL DEFAULT 0,
  version          INTEGER       NOT NULL DEFAULT 1,
  computed_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE mirror_score_history (
  id          SERIAL       PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  total_score DECIMAL(5,2) NOT NULL,
  recorded_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── JOB POSTINGS ───────────────────────────────────────────

CREATE TABLE job_postings (
  id               SERIAL       PRIMARY KEY,
  external_id      VARCHAR(200) UNIQUE,
  title            VARCHAR(300) NOT NULL,
  company          VARCHAR(200),
  location         VARCHAR(200),
  remote           BOOLEAN      DEFAULT FALSE,
  description      TEXT,
  tagged_skill_ids INTEGER[]    DEFAULT '{}',
  raw_skill_text   TEXT[]       DEFAULT '{}',
  salary_min       INTEGER,
  salary_max       INTEGER,
  salary_currency  VARCHAR(10)  DEFAULT 'USD',
  source           VARCHAR(100),
  source_url       VARCHAR(500),
  posted_at        TIMESTAMPTZ,
  ingested_at      TIMESTAMPTZ  DEFAULT NOW(),
  is_active        BOOLEAN      DEFAULT TRUE
);

-- ─── JOB MATCHES ────────────────────────────────────────────

CREATE TABLE user_job_matches (
  id              SERIAL       PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id          INTEGER      NOT NULL REFERENCES job_postings(id),
  overlap_score   DECIMAL(5,2) NOT NULL,
  llm_rank        INTEGER,
  llm_explanation TEXT,
  computed_at     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- ─── SKILL DEMAND ────────────────────────────────────────────

CREATE TABLE skill_demand_snapshots (
  id             SERIAL  PRIMARY KEY,
  skill_id       INTEGER NOT NULL REFERENCES skills(id),
  job_count_7d   INTEGER DEFAULT 0,
  job_count_30d  INTEGER DEFAULT 0,
  avg_salary_min INTEGER,
  avg_salary_max INTEGER,
  snapshot_date  DATE    NOT NULL,
  UNIQUE(skill_id, snapshot_date)
);

-- ─── INDEXES ────────────────────────────────────────────────

CREATE INDEX idx_skills_domain  ON skills(domain_id);
CREATE INDEX idx_skills_family  ON skills(family_id);
CREATE INDEX idx_xp_user        ON user_skill_xp(user_id);
CREATE INDEX idx_xp_skill       ON user_skill_xp(skill_id);
CREATE INDEX idx_scores_user    ON mirror_scores(user_id);
CREATE INDEX idx_jobs_active    ON job_postings(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_jobs_tagged    ON job_postings USING GIN(tagged_skill_ids);
CREATE INDEX idx_matches_user   ON user_job_matches(user_id);
CREATE INDEX idx_demand_skill   ON skill_demand_snapshots(skill_id, snapshot_date DESC);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_xp    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mirror_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_job_matches  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile"        ON user_profiles    FOR ALL     USING (auth.uid() = id);
CREATE POLICY "own xp"             ON user_skill_xp    FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own scores"         ON mirror_scores     FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "own matches"        ON user_job_matches  FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "skills public read" ON skills            FOR SELECT  USING (true);
CREATE POLICY "jobs public read"   ON job_postings      FOR SELECT  USING (is_active = true);
