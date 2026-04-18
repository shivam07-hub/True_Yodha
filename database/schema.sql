-- ============================================================
-- MIRROR APP — Database Schema v4.0
-- Apply in Supabase SQL Editor (Project → SQL Editor → New query)
-- Last updated: 2026-04-18
--
-- Skill taxonomy source of truth: Lightcast Skills Taxonomy
--   L1 = category   (31 top-level domains, e.g. "Information Technology")
--   L2 = subcategory (442 clusters, e.g. "Software Development")
--   L3 = skill leaf  (35,108 skills with hex IDs)
--
-- Removed tables (dropped 2026-04-18):
--   skill_domains, skill_families, skill_levels,
--   candidate_skills_queue, skill_demand_snapshots
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── SKILL TAXONOMY ─────────────────────────────────────────
-- Single source of truth for all skills.
-- Populated on demand by taxonomy_loader.ensure_skill_in_db()
-- from the bundled Lightcast JSON taxonomy.
-- category    = Lightcast L1 domain name
-- subcategory = Lightcast L2 cluster name
-- lightcast_id = hex skill ID from Lightcast (e.g. KS126XS6CQCFGC3NG79X)

CREATE TABLE skills (
  id           SERIAL       PRIMARY KEY,
  taxonomy_key VARCHAR(200) NOT NULL UNIQUE,   -- canonical lowercase skill name
  display_name VARCHAR(200) NOT NULL,
  lightcast_id VARCHAR(50),                    -- Lightcast hex skill ID (nullable until looked up)
  category     VARCHAR(200) NOT NULL DEFAULT 'General',   -- Lightcast L1
  subcategory  VARCHAR(200) NOT NULL DEFAULT 'General',   -- Lightcast L2
  is_active    BOOLEAN      DEFAULT TRUE,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
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
  cv_raw_text         TEXT,                    -- raw extracted text from latest CV upload
  cv_parsed_at        TIMESTAMPTZ,
  onboarding_complete BOOLEAN      DEFAULT FALSE,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  last_active_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── CV HISTORY ─────────────────────────────────────────────
-- One row per CV upload. Tracks score trajectory over time.

CREATE TABLE cv_history (
  id           SERIAL       PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skills_count INTEGER      NOT NULL DEFAULT 0,
  mirror_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  uploaded_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── USER SKILLS ────────────────────────────────────────────
-- One row per skill per user.
-- matched_level 0–5 maps to: None / Scout / Trailblazer / Excavator / Cartographer / Legend
-- proficiency_title is the human-readable label for matched_level.
-- source: 'cv' (parsed from CV) | 'diary' (awarded from diary entry) | 'manual'

CREATE TABLE user_skills (
  id               SERIAL       PRIMARY KEY,
  user_id          UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skill_id         INTEGER      NOT NULL REFERENCES skills(id),
  matched_level    INTEGER      NOT NULL DEFAULT 0 CHECK (matched_level BETWEEN 0 AND 5),
  proficiency_title VARCHAR(30) DEFAULT 'Scout',
  source           VARCHAR(30)  DEFAULT 'cv',
  evidence_text    TEXT,
  last_updated     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

-- ─── MIRROR SCORES ──────────────────────────────────────────
-- One row per user (upserted on each score compute).
-- domain_scores: {L1_domain_name: 0–100}
-- gap_skills: aspiration-driven skill gaps for the current week
-- rank_tier + percentile: INTERNAL ONLY — never expose via API

CREATE TABLE mirror_scores (
  id              SERIAL       PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  total_score     DECIMAL(5,2) NOT NULL,
  domain_scores   JSONB        NOT NULL DEFAULT '{}',
  skill_scores    JSONB        NOT NULL DEFAULT '{}',
  gap_skills      JSONB        NOT NULL DEFAULT '[]',
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

-- ─── JOBS ───────────────────────────────────────────────────
-- Scraped job postings. job_id is a stable external identifier.
-- main_skills = required (must-have), side_skills = nice-to-have.
-- Skill demand is computed live from these arrays by scoring_engine.
-- fetch_skill_demand(): main_skills weighted ×2, side_skills ×1.

CREATE TABLE jobs (
  job_id           TEXT         PRIMARY KEY,
  job_title        VARCHAR(300) NOT NULL,
  company_name     VARCHAR(200),
  industry         VARCHAR(200),
  location         VARCHAR(200),
  apply_url        VARCHAR(500),
  job_description  TEXT,
  main_skills      TEXT[]       DEFAULT '{}',
  side_skills      TEXT[]       DEFAULT '{}',
  batch_date       DATE         NOT NULL DEFAULT CURRENT_DATE
);

-- ─── JOB MATCHES ────────────────────────────────────────────
-- Top matches per user per week by skill overlap + LLM ranking.
-- batch_week = Monday of the week this set was generated.
-- is_recommended = TRUE marks the top 3 surfaced to the user.

CREATE TABLE user_job_matches (
  id              SERIAL       PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id          TEXT         NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  batch_week      DATE         NOT NULL,
  overlap_score   DECIMAL(5,2) NOT NULL,
  llm_rank        INTEGER,
  llm_explanation TEXT,
  is_recommended  BOOLEAN      DEFAULT FALSE,
  action_plan     JSONB        DEFAULT '[]',
  computed_at     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, job_id, batch_week)
);

-- ─── JOB APPLICATIONS ───────────────────────────────────────

CREATE TABLE job_applications (
  id               SERIAL      PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id           TEXT        NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  match_id         INTEGER     REFERENCES user_job_matches(id),
  status           VARCHAR(30) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','applied','no_response','responded','interviewing','rejected','offer')),
  applied_at       TIMESTAMPTZ,
  company_response TEXT,
  response_at      TIMESTAMPTZ,
  checkin_sent_at  TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- ─── DAILY LOGS ─────────────────────────────────────────────
-- One entry per user per day (upsert on user_id + log_date).
-- skills_delta: [{taxonomy_key, xp_added, evidence}]

CREATE TABLE daily_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  log_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  entry_text   TEXT        NOT NULL,
  skills_delta JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, log_date)
);

-- ─── INDEXES ────────────────────────────────────────────────

CREATE INDEX idx_skills_category      ON skills(category);
CREATE INDEX idx_skills_subcategory   ON skills(subcategory);
CREATE INDEX idx_skills_lightcast_id  ON skills(lightcast_id) WHERE lightcast_id IS NOT NULL;
CREATE INDEX idx_user_skills_user     ON user_skills(user_id);
CREATE INDEX idx_user_skills_skill    ON user_skills(skill_id);
CREATE INDEX idx_scores_user          ON mirror_scores(user_id);
CREATE INDEX idx_score_history_user   ON mirror_score_history(user_id, recorded_at DESC);
CREATE INDEX idx_cv_history_user      ON cv_history(user_id, uploaded_at DESC);
CREATE INDEX idx_jobs_main_skills     ON jobs USING GIN(main_skills);
CREATE INDEX idx_jobs_side_skills     ON jobs USING GIN(side_skills);
CREATE INDEX idx_jobs_batch_date      ON jobs(batch_date DESC);
CREATE INDEX idx_matches_user         ON user_job_matches(user_id);
CREATE INDEX idx_matches_batch_week   ON user_job_matches(user_id, batch_week DESC);
CREATE INDEX idx_matches_recommended  ON user_job_matches(user_id) WHERE is_recommended = TRUE;
CREATE INDEX idx_applications_user    ON job_applications(user_id);
CREATE INDEX idx_daily_logs_user      ON daily_logs(user_id);
CREATE INDEX idx_daily_logs_date      ON daily_logs(user_id, log_date DESC);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE user_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mirror_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_job_matches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_history         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile"        ON user_profiles    FOR ALL     USING (auth.uid() = id);
CREATE POLICY "own skills"         ON user_skills       FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own scores"         ON mirror_scores     FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "own matches"        ON user_job_matches  FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own applications"   ON job_applications  FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own diary"          ON daily_logs        FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own cv history"     ON cv_history        FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "skills public read" ON skills            FOR SELECT  USING (true);
CREATE POLICY "jobs public read"   ON jobs              FOR SELECT  USING (true);
