-- ============================================================
-- MIRROR APP — Database Schema v5.0
-- Apply in Supabase SQL Editor (Project → SQL Editor → New query)
-- Last updated: 2026-04-18
--
-- Skill taxonomy: single skills table with l1_domain + l2_cluster denormalized
--   L1 = l1_domain  (31 domains,  e.g. "Information Technology")
--   L2 = l2_cluster (442 clusters, e.g. "Software Development")
--   L3 = taxonomy_key (35,108 leaf skills with Lightcast hex IDs)
--
-- Removed tables:
--   skill_domains, skill_clusters (flattened into skills.l1_domain/l2_cluster)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── SKILL TAXONOMY — single table, Lightcast L1/L2/L3 ──────
--
-- One row per L3 skill with l1_domain + l2_cluster denormalized.
-- L1/L2 aggregation done at query time via GROUP BY.
-- Users are always matched at L3 (skill_id in user_skills).
--
-- Populated by: python database/backfill_skills.py
-- Source:       lightcast_skills_taxonomy.json

CREATE TABLE skills (
  id           SERIAL       PRIMARY KEY,
  taxonomy_key VARCHAR(200) NOT NULL UNIQUE,   -- canonical Lightcast skill name (L3)
  display_name VARCHAR(200) NOT NULL,
  lightcast_id VARCHAR(50),                    -- Lightcast hex ID (e.g. KS126XS6CQCFGC3NG79X)
  l1_domain    VARCHAR(200) NOT NULL DEFAULT '',  -- Lightcast L1 e.g. "Information Technology"
  l2_cluster   VARCHAR(200) NOT NULL DEFAULT '',  -- Lightcast L2 e.g. "Software Development"
  is_active    BOOLEAN      DEFAULT TRUE,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── USERS ──────────────────────────────────────────────────

CREATE TABLE user_profiles (
  id                  UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               VARCHAR(255) UNIQUE NOT NULL,
  full_name           VARCHAR(255),
  linkedin_url        VARCHAR(500),
  linkedin_xp_granted BOOLEAN      NOT NULL DEFAULT FALSE,
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
  id                SERIAL       PRIMARY KEY,
  user_id           UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skills_count      INTEGER      NOT NULL DEFAULT 0,
  mirror_score      DECIMAL(5,2) NOT NULL DEFAULT 0,
  uploaded_at       TIMESTAMPTZ  DEFAULT NOW(),
  cv_raw_text       TEXT,
  version_number    INTEGER      NOT NULL DEFAULT 1,
  version_type      VARCHAR(30)  NOT NULL DEFAULT 'baseline_upload'
                   CHECK (version_type IN ('baseline_upload','generated_draft')),
  title             VARCHAR(200),
  evidence_snapshot JSONB        NOT NULL DEFAULT '[]',
  evidence_count    INTEGER      NOT NULL DEFAULT 0,
  UNIQUE(user_id, version_number)
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
  location_raw     TEXT,
  location_city    VARCHAR(200),
  location_country VARCHAR(200),
  location_mode    VARCHAR(20)  NOT NULL DEFAULT 'unknown'
                   CHECK (location_mode IN ('onsite','hybrid','remote','unknown')),
  location_quality VARCHAR(20)  NOT NULL DEFAULT 'unknown'
                   CHECK (location_quality IN ('ok','unknown')),
  apply_url        VARCHAR(500),
  job_description  TEXT,
  main_skills      TEXT[]       DEFAULT '{}',
  side_skills      TEXT[]       DEFAULT '{}',
  batch_date       DATE         NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_jobs_location_city    ON jobs(location_city);
CREATE INDEX idx_jobs_location_country ON jobs(location_country);
CREATE INDEX idx_jobs_location_mode    ON jobs(location_mode);

-- ─── JOB FEED RUN AUDITS ─────────────────────────────────────
-- Operational ingest telemetry. One row per feed import run.
-- Unknown location rate > threshold should block the run.

CREATE TABLE job_feed_run_audits (
  id                    BIGSERIAL   PRIMARY KEY,
  run_id                UUID        NOT NULL UNIQUE,
  source                VARCHAR(80) NOT NULL DEFAULT 'job_feed_importer',
  parser_version        VARCHAR(40) NOT NULL,
  total_rows            INTEGER     NOT NULL DEFAULT 0,
  unknown_location_rows INTEGER     NOT NULL DEFAULT 0,
  unknown_location_rate DECIMAL(6,5) NOT NULL DEFAULT 0
                        CHECK (unknown_location_rate BETWEEN 0 AND 1),
  top_unknown_aliases   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status                VARCHAR(30) NOT NULL DEFAULT 'ok',
  message               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_feed_run_audits_created_at ON job_feed_run_audits(created_at DESC);

-- ─── JOB SKILLS (normalised) ────────────────────────────────
-- FK-enforced join table: each row links a job to a taxonomy skill.
-- is_primary=true → main_skills (must-have); false → side_skills (nice-to-have).
-- A trigger on jobs keeps this in sync when main_skills/side_skills are written.

CREATE TABLE job_skills (
  id         BIGSERIAL PRIMARY KEY,
  job_id     TEXT      NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  skill_id   INT       NOT NULL REFERENCES skills(id),
  is_primary BOOLEAN   NOT NULL DEFAULT true,
  UNIQUE (job_id, skill_id)
);

CREATE INDEX idx_job_skills_job_id   ON job_skills(job_id);
CREATE INDEX idx_job_skills_skill_id ON job_skills(skill_id);

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
  -- Vocabulary and default both moved off the original 'pending' wording:
  -- 20260517_tracker_v1 remapped the data, and 20260826100000 finally moved
  -- the DEFAULT, which had been left pointing at a value this CHECK rejects.
  status           VARCHAR(30) NOT NULL DEFAULT 'saved'
                   CHECK (status IN ('saved','applied','screening','interviewing','final_round','ghosted','rejected','offer','withdrew')),
  applied_at       TIMESTAMPTZ,
  company_response TEXT,
  response_at      TIMESTAMPTZ,
  checkin_sent_at  TIMESTAMPTZ,
  followed_up_at   TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  offer_received_at TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- ─── JOB PATH TARGETS ────────────────────────────────────────

CREATE TABLE job_application_skill_targets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id      TEXT        NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  skill       VARCHAR(200) NOT NULL,
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, job_id, skill)
);

CREATE TABLE job_application_milestones (
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

CREATE TABLE job_cv_variants (
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

-- ─── USER MILESTONES ────────────────────────────────────────
-- Structured evidence collected from the 7-day progress plan.
-- Completed milestones become inputs for generated CV versions.

CREATE TABLE user_milestones (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  milestone_date DATE        NOT NULL,
  skill          VARCHAR(200),
  task           TEXT        NOT NULL,
  proof          TEXT,
  impact         TEXT,
  confidence     DECIMAL(3,2) NOT NULL DEFAULT 0.60 CHECK (confidence BETWEEN 0 AND 1),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, milestone_date)
);

-- ─── USER FEEDBACK ──────────────────────────────────────────
-- Collects in-app feedback, company suggestions, and bug reports.
-- user_id nullable — feedback can be submitted without being logged in.
-- payload is free-form JSONB keyed by form field names.

CREATE TABLE user_feedback (
  id         SERIAL       PRIMARY KEY,
  user_id    UUID         REFERENCES user_profiles(id) ON DELETE SET NULL,
  type       VARCHAR(20)  NOT NULL CHECK (type IN ('feedback', 'company', 'bug')),
  payload    JSONB        NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── INDEXES ────────────────────────────────────────────────

CREATE INDEX idx_skills_l1_domain    ON skills(l1_domain);
CREATE INDEX idx_skills_l2_cluster   ON skills(l2_cluster);
CREATE INDEX idx_skills_lightcast_id ON skills(lightcast_id) WHERE lightcast_id IS NOT NULL;
CREATE INDEX idx_user_skills_user     ON user_skills(user_id);
CREATE INDEX idx_user_skills_skill    ON user_skills(skill_id);
CREATE INDEX idx_scores_user          ON mirror_scores(user_id);
CREATE INDEX idx_score_history_user   ON mirror_score_history(user_id, recorded_at DESC);
CREATE INDEX idx_cv_history_user      ON cv_history(user_id, uploaded_at DESC);
CREATE INDEX idx_cv_history_version   ON cv_history(user_id, version_number DESC);
CREATE INDEX idx_jobs_main_skills     ON jobs USING GIN(main_skills);
CREATE INDEX idx_jobs_side_skills     ON jobs USING GIN(side_skills);
CREATE INDEX idx_jobs_batch_date      ON jobs(batch_date DESC);
CREATE INDEX idx_matches_user         ON user_job_matches(user_id);
CREATE INDEX idx_matches_batch_week   ON user_job_matches(user_id, batch_week DESC);
CREATE INDEX idx_matches_recommended  ON user_job_matches(user_id) WHERE is_recommended = TRUE;
CREATE INDEX idx_applications_user    ON job_applications(user_id);
CREATE INDEX idx_job_path_targets_user_job ON job_application_skill_targets(user_id, job_id);
CREATE INDEX idx_job_path_milestones_user_job_date ON job_application_milestones(user_id, job_id, milestone_date);
CREATE INDEX idx_job_cv_variants_user_job ON job_cv_variants(user_id, job_id, created_at DESC);
CREATE INDEX idx_daily_logs_user      ON daily_logs(user_id);
CREATE INDEX idx_daily_logs_date      ON daily_logs(user_id, log_date DESC);
CREATE INDEX idx_milestones_user      ON user_milestones(user_id, milestone_date DESC);
CREATE INDEX idx_milestones_completed ON user_milestones(user_id, completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_feedback_user        ON user_feedback(user_id);
CREATE INDEX idx_feedback_type        ON user_feedback(type);
CREATE INDEX idx_feedback_created     ON user_feedback(created_at DESC);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE user_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mirror_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mirror_score_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_job_matches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_application_skill_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_application_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cv_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback      ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_skills         ENABLE ROW LEVEL SECURITY;
-- Operational feed telemetry is service-role-only; no client policy is intentional.
ALTER TABLE job_feed_run_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile"        ON user_profiles    FOR ALL     USING (auth.uid() = id);
CREATE POLICY "own skills"         ON user_skills       FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own scores"         ON mirror_scores         FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own score history"  ON mirror_score_history  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own matches"        ON user_job_matches  FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own applications"   ON job_applications  FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own job path targets" ON job_application_skill_targets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own job path milestones" ON job_application_milestones FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own job cv variants" ON job_cv_variants FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own diary"          ON daily_logs        FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own milestones"     ON user_milestones   FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "own cv history"     ON cv_history        FOR ALL     USING (auth.uid() = user_id);
CREATE POLICY "skills public read"    ON skills     FOR SELECT USING (true);
CREATE POLICY "jobs public read"      ON jobs       FOR SELECT USING (true);
CREATE POLICY "job_skills public read" ON job_skills FOR SELECT USING (true);
CREATE POLICY "feedback insert"    ON user_feedback     FOR INSERT  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "own feedback read"  ON user_feedback     FOR SELECT  USING (auth.uid() = user_id);
