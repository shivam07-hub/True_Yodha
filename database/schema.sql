-- ============================================================
-- MIRROR APP — Database Schema v3.0
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
  id         SERIAL       PRIMARY KEY,
  domain_id  INTEGER      NOT NULL REFERENCES skill_domains(id),
  code       VARCHAR(20)  NOT NULL UNIQUE,
  name       VARCHAR(100) NOT NULL,
  sort_order INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE skills (
  id                 SERIAL       PRIMARY KEY,
  domain_id          INTEGER      NOT NULL REFERENCES skill_domains(id),
  family_id          INTEGER      NOT NULL REFERENCES skill_families(id),
  taxonomy_key       VARCHAR(200) NOT NULL UNIQUE,
  display_name       VARCHAR(200) NOT NULL,
  demand_trend       VARCHAR(20)  DEFAULT 'stable'
                     CHECK (demand_trend IN ('rising', 'stable', 'falling')),
  technology_aliases TEXT[]       DEFAULT '{}',
  is_active          BOOLEAN      DEFAULT TRUE,
  sort_order         INTEGER      DEFAULT 0,
  created_at         TIMESTAMPTZ  DEFAULT NOW()
);

-- skill_levels defines what L1–L5 means for each skill.
-- This is the taxonomy benchmark — used to:
--   (a) match CV evidence to a level for the user
--   (b) categorise what level a job posting requires
-- Definitions update when market evidence warrants it.
CREATE TABLE skill_levels (
  id          SERIAL      PRIMARY KEY,
  skill_id    INTEGER     NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level       INTEGER     NOT NULL CHECK (level BETWEEN 1 AND 5),
  label       VARCHAR(20) NOT NULL,   -- Foundation / Practitioner / Professional / Expert / Authority
  description TEXT        NOT NULL,  -- The benchmark definition — critical for CV matching and job tagging
  UNIQUE(skill_id, level)
);

-- ─── USERS ──────────────────────────────────────────────────

CREATE TABLE user_profiles (
  id                  UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- ─── USER SKILLS ────────────────────────────────────────────
-- One row per skill per user.
-- matched_level is determined by comparing CV evidence text
-- against skill_levels.description — NOT a direct self-assessment.

CREATE TABLE user_skills (
  id            SERIAL       PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skill_id      INTEGER      NOT NULL REFERENCES skills(id),
  matched_level INTEGER      NOT NULL DEFAULT 0 CHECK (matched_level BETWEEN 0 AND 5),
  source        VARCHAR(30)  DEFAULT 'cv',     -- 'cv' | 'manual'
  confidence    DECIMAL(3,2) DEFAULT 0.5,      -- parser confidence 0.0–1.0
  evidence_text TEXT,                          -- raw CV text that triggered this match
  last_updated  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

-- ─── MIRROR SCORES ──────────────────────────────────────────

CREATE TABLE mirror_scores (
  id              SERIAL       PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  total_score     DECIMAL(5,2) NOT NULL,
  domain_scores   JSONB        NOT NULL DEFAULT '{}',
  skill_scores    JSONB        NOT NULL DEFAULT '{}',
  gap_skills      JSONB        NOT NULL DEFAULT '[]',
  -- rank_tier and percentile: INTERNAL ONLY — never expose via API
  rank_tier       VARCHAR(30),
  percentile      DECIMAL(5,2),
  skills_assessed INTEGER      NOT NULL DEFAULT 0,
  version         INTEGER      NOT NULL DEFAULT 1,
  computed_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE mirror_score_history (
  id          SERIAL       PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  total_score DECIMAL(5,2) NOT NULL,
  recorded_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── JOB POSTINGS ───────────────────────────────────────────
-- primary_skills and secondary_skills store skill_id + required_level per skill.
-- Format: [{"skill_id": 1, "required_level": 3}, ...]
-- required_level maps to skill_levels.level for that skill.

CREATE TABLE job_postings (
  id               SERIAL       PRIMARY KEY,
  external_id      VARCHAR(200) UNIQUE,
  title            VARCHAR(300) NOT NULL,
  company          VARCHAR(200),
  location         VARCHAR(200),
  remote           BOOLEAN      DEFAULT FALSE,
  description      TEXT,
  primary_skills   JSONB        DEFAULT '[]',   -- required skills (must-have)
  secondary_skills JSONB        DEFAULT '[]',   -- nice-to-have skills
  raw_skill_text   TEXT[]       DEFAULT '{}',   -- unmatched skill strings from source
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
-- Top 5 jobs per user by skill overlap, LLM-ranked.
-- is_recommended = TRUE marks the top 3 surfaced to the user.
-- action_plan stores the 7-day CV alignment plan per job.

CREATE TABLE user_job_matches (
  id              SERIAL       PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id          INTEGER      NOT NULL REFERENCES job_postings(id),
  overlap_score   DECIMAL(5,2) NOT NULL,
  llm_rank        INTEGER,
  llm_explanation TEXT,
  is_recommended  BOOLEAN      DEFAULT FALSE,   -- TRUE for top 3 surfaced to user
  action_plan     JSONB        DEFAULT '[]',    -- 7-day plan: [{day: 1, tasks: [...]}]
  computed_at     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- ─── JOB APPLICATIONS ───────────────────────────────────────
-- Tracks the user's real-world application journey per job.
-- Checkin at 1 week: system notifies user of application status.

CREATE TABLE job_applications (
  id               SERIAL      PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id           INTEGER     NOT NULL REFERENCES job_postings(id),
  match_id         INTEGER     REFERENCES user_job_matches(id),
  status           VARCHAR(30) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','applied','no_response','responded','interviewing','rejected','offer')),
  applied_at       TIMESTAMPTZ,
  company_response TEXT,
  response_at      TIMESTAMPTZ,
  checkin_sent_at  TIMESTAMPTZ,  -- when the week-1 check-in notification was sent
  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- ─── SKILL DEMAND ────────────────────────────────────────────
-- Snapshot of how many jobs require each skill.
-- demand_trend on skills table is computed from these counts over time.

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

CREATE INDEX idx_skills_domain        ON skills(domain_id);
CREATE INDEX idx_skills_family        ON skills(family_id);
CREATE INDEX idx_user_skills_user     ON user_skills(user_id);
CREATE INDEX idx_user_skills_skill    ON user_skills(skill_id);
CREATE INDEX idx_scores_user          ON mirror_scores(user_id);
CREATE INDEX idx_jobs_active          ON job_postings(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_jobs_primary_skills  ON job_postings USING GIN(primary_skills);
CREATE INDEX idx_jobs_secondary_skills ON job_postings USING GIN(secondary_skills);
CREATE INDEX idx_matches_user         ON user_job_matches(user_id);
CREATE INDEX idx_matches_recommended  ON user_job_matches(user_id) WHERE is_recommended = TRUE;
CREATE INDEX idx_applications_user    ON job_applications(user_id);
CREATE INDEX idx_demand_skill         ON skill_demand_snapshots(skill_id, snapshot_date DESC);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE user_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mirror_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_job_matches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile"        ON user_profiles    FOR ALL     USING (auth.uid() = id);
CREATE POLICY "own skills"         ON user_skills       FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own scores"         ON mirror_scores     FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "own matches"        ON user_job_matches  FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own applications"   ON job_applications  FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "skills public read" ON skills            FOR SELECT  USING (true);
CREATE POLICY "jobs public read"   ON job_postings      FOR SELECT  USING (is_active = true);