-- 20260609_upskilling_quiz_bank.sql
-- Practice → Upskilling overhaul, Slice 1 (data model).
-- PRD: docs/PRD_practice_upskilling_skillgap.md §6.
--
-- Four tables behind the MCQ upskilling ladder (Surface A) and the job-anchored
-- skill-gap calibration (Surface B):
--
--   skill_questions      — the question bank. WRITTEN by the scraper pipeline
--                          (firecrawl_Supabase repo), READ by this backend.
--                          Service-read only — the answer key never reaches a
--                          browser; grading happens server-side in POST /submit.
--   quiz_attempts        — one served+graded set (upskilling or gap calibration).
--   quiz_answers         — append-only per-question selections (audit + no-key proof).
--   skill_assessed_level — verified proficiency per user×skill. DEC-1a: this is
--                          the demonstrated-knowledge signal that drives the
--                          skill's headline level (replacing the deprecated
--                          time-based forge counter). The submit path bumps
--                          user_skills.matched_level = max(legacy, assessed) so
--                          no user regresses (grandfather).
--
-- Reward idempotency is NOT a new ledger: the existing reward_xp RPC + xp_ledger
-- (20260528_reward_xp_rpc.sql) already credit atomically and idempotently per
-- (action, ref_table, ref_id). First-clear award uses
--   action='upskilling_clear', ref_table='quiz_attempts', ref_id=attempt_id.
-- A second clear with a prior ledger row short-circuits — no double-pay.
--
-- skill_id is INT REFERENCES skills(id) to match the live taxonomy (job_skills /
-- user_skills both use INT; the PRD's "bigint" was illustrative).
--
-- Idempotent: safe to re-run (IF NOT EXISTS guards throughout).
-- Manual run via Supabase dashboard per feedback_supabase_migrations_manual.

BEGIN;

-- ── 1. Question bank (scraper-written, service-read) ─────────────────────────
CREATE TABLE IF NOT EXISTS skill_questions (
  id             BIGSERIAL    PRIMARY KEY,
  skill_id       INT          NOT NULL REFERENCES skills(id),
  -- denormalized taxonomy key (== skills.taxonomy_key / Lightcast L3 name) for
  -- fast lookup without a join from the pipeline side.
  skill_key      TEXT         NOT NULL,
  level          SMALLINT     NOT NULL CHECK (level BETWEEN 1 AND 5),
  question_text  TEXT         NOT NULL,
  -- exactly 4 option strings, e.g. ["...","...","...","..."]
  options        JSONB        NOT NULL,
  correct_index  SMALLINT     NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation    TEXT         NOT NULL,
  source_url     TEXT,
  dedupe_hash    TEXT         NOT NULL,
  -- active | review | retired. Only 'active' is ever served.
  status         TEXT         NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- same (skill, level, normalized text) never enters the pool twice.
  UNIQUE (skill_id, level, dedupe_hash),
  CONSTRAINT skill_questions_options_is_array CHECK (jsonb_typeof(options) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_skill_questions_serve
  ON skill_questions (skill_id, level) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_skill_questions_key
  ON skill_questions (skill_key, level) WHERE status = 'active';

-- Service-read only: no public/anon SELECT (would leak the answer key). The
-- backend reads via the service-role client, which bypasses RLS.
ALTER TABLE skill_questions ENABLE ROW LEVEL SECURITY;
-- (No SELECT policy on purpose — only service-role may read.)

-- ── 2. One served + graded set ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skill_id        INT          REFERENCES skills(id),          -- null for multi-skill gap sets
  level           SMALLINT,                                    -- null for gap-calibration multi-level sets
  mode            TEXT         NOT NULL DEFAULT 'upskilling',  -- 'upskilling' | 'gap_calibration'
  job_id          TEXT,                                        -- set for gap mode
  -- the exact set served, in order (audit + no-key proof).
  question_ids    BIGINT[]     NOT NULL,
  score           SMALLINT,
  max_score       SMALLINT,
  passed          BOOLEAN,
  tokens_awarded  INTEGER      NOT NULL DEFAULT 0,
  -- client-supplied UUID; one logical submit cannot grade twice.
  idempotency_key TEXT,
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user
  ON quiz_attempts (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_skill_level
  ON quiz_attempts (user_id, skill_id, level);
-- one grade per (user, idempotency_key) — concurrent double-submit collapses.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_idem
  ON quiz_attempts (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz_attempts owner read" ON quiz_attempts;
CREATE POLICY "quiz_attempts owner read" ON quiz_attempts
  FOR SELECT USING (auth.uid() = user_id);
-- Writes go through the service-role backend (grading holds the key), so no
-- INSERT/UPDATE policy is granted to end users.

-- ── 3. Append-only answers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_answers (
  attempt_id     UUID      NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id    BIGINT    NOT NULL REFERENCES skill_questions(id),
  selected_index SMALLINT  NOT NULL,
  is_correct     BOOLEAN   NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz_answers owner read" ON quiz_answers;
CREATE POLICY "quiz_answers owner read" ON quiz_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quiz_attempts a
      WHERE a.id = quiz_answers.attempt_id AND a.user_id = auth.uid()
    )
  );

-- ── 4. Verified proficiency per user×skill (one source of truth) ─────────────
CREATE TABLE IF NOT EXISTS skill_assessed_level (
  user_id          UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skill_id         INT         NOT NULL REFERENCES skills(id),
  assessed_level   SMALLINT    NOT NULL DEFAULT 0 CHECK (assessed_level BETWEEN 0 AND 5),
  last_assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, skill_id)
);

ALTER TABLE skill_assessed_level ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "skill_assessed_level owner read" ON skill_assessed_level;
CREATE POLICY "skill_assessed_level owner read" ON skill_assessed_level
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;
