-- Learning Ladder content foundation (Backlog #15).
--
-- Additive, deploy-safe schema for reviewed-only question publication:
--   1. source allowlists per taxonomy skill,
--   2. immutable content editions,
--   3. review/provenance/rationale metadata on skill_questions,
--   4. immutable served-question snapshots for attempt history.
--
-- Existing rows remain present, but new backend serving requires
-- review_status='published' plus complete source/review/rationale metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_content_editions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_key                 TEXT NOT NULL UNIQUE,
  title                       TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'review', 'published', 'retired')),
  coverage_target_skills_min  INTEGER NOT NULL DEFAULT 50 CHECK (coverage_target_skills_min > 0),
  coverage_target_skills_max  INTEGER NOT NULL DEFAULT 60 CHECK (coverage_target_skills_max >= coverage_target_skills_min),
  questions_per_level_min     INTEGER NOT NULL DEFAULT 10 CHECK (questions_per_level_min > 0),
  questions_per_level_max     INTEGER NOT NULL DEFAULT 12 CHECK (questions_per_level_max >= questions_per_level_min),
  reviewer                    TEXT,
  published_at                TIMESTAMPTZ,
  retired_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_content_editions_publish_timestamp
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

ALTER TABLE public.learning_content_editions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.learning_content_editions IS
  'Immutable Learning Ladder publication editions. Service-role/content-ops only; no direct client policies.';

CREATE TABLE IF NOT EXISTS public.learning_source_allowlist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id          INTEGER NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  source_url        TEXT NOT NULL,
  source_title      TEXT,
  source_type       TEXT NOT NULL
                      CHECK (source_type IN (
                        'official_documentation',
                        'standards_body',
                        'authoritative_textbook',
                        'open_course',
                        'official_reference',
                        'other_reviewed'
                      )),
  publisher         TEXT,
  provenance        TEXT NOT NULL,
  license_posture   TEXT NOT NULL,
  reviewer          TEXT NOT NULL,
  verified_at       DATE NOT NULL,
  retired_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_id, source_url)
);

ALTER TABLE public.learning_source_allowlist ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.learning_source_allowlist IS
  'Reviewed source allowlist for Learning Ladder question authoring. Service-role/content-ops only.';

ALTER TABLE public.skill_questions
  ADD COLUMN IF NOT EXISTS content_edition_id UUID REFERENCES public.learning_content_editions(id),
  ADD COLUMN IF NOT EXISTS source_allowlist_id UUID REFERENCES public.learning_source_allowlist(id),
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS generation_provenance TEXT,
  ADD COLUMN IF NOT EXISTS source_provenance TEXT,
  ADD COLUMN IF NOT EXISTS license_posture TEXT,
  ADD COLUMN IF NOT EXISTS reviewer TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at DATE,
  ADD COLUMN IF NOT EXISTS rationales JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS replaces_question_id BIGINT REFERENCES public.skill_questions(id),
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retirement_reason TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skill_questions_review_status_check'
      AND conrelid = 'public.skill_questions'::regclass
  ) THEN
    ALTER TABLE public.skill_questions
      ADD CONSTRAINT skill_questions_review_status_check
      CHECK (review_status IN ('generated', 'normalized', 'needs_review', 'reviewed', 'published', 'retired'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skill_questions_rationales_object_check'
      AND conrelid = 'public.skill_questions'::regclass
  ) THEN
    ALTER TABLE public.skill_questions
      ADD CONSTRAINT skill_questions_rationales_object_check
      CHECK (jsonb_typeof(rationales) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skill_questions_publishable_reviewed
  ON public.skill_questions (skill_id, level, content_edition_id)
  WHERE status = 'active'
    AND review_status = 'published'
    AND content_edition_id IS NOT NULL
    AND source_url IS NOT NULL
    AND source_provenance IS NOT NULL
    AND license_posture IS NOT NULL
    AND reviewer IS NOT NULL
    AND reviewed_at IS NOT NULL
    AND verified_at IS NOT NULL
    AND retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_skill_questions_replacement_chain
  ON public.skill_questions (replaces_question_id)
  WHERE replaces_question_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.quiz_attempt_question_snapshots (
  attempt_id          UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id         BIGINT NOT NULL REFERENCES public.skill_questions(id),
  position            INTEGER NOT NULL CHECK (position >= 0),
  skill_id            INTEGER NOT NULL REFERENCES public.skills(id),
  skill_key           TEXT NOT NULL,
  level               INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  question_text       TEXT NOT NULL,
  options             JSONB NOT NULL,
  correct_index       INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation         TEXT NOT NULL,
  rationales          JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_url          TEXT,
  source_provenance   TEXT,
  license_posture     TEXT,
  reviewer            TEXT,
  verified_at         DATE,
  content_edition_id  UUID REFERENCES public.learning_content_editions(id),
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT quiz_attempt_question_snapshots_options_array
    CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  CONSTRAINT quiz_attempt_question_snapshots_rationales_object
    CHECK (jsonb_typeof(rationales) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_question_snapshots_attempt_position
  ON public.quiz_attempt_question_snapshots (attempt_id, position);

ALTER TABLE public.quiz_attempt_question_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_attempt_question_snapshots owner read"
  ON public.quiz_attempt_question_snapshots;
CREATE POLICY "quiz_attempt_question_snapshots owner read"
  ON public.quiz_attempt_question_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quiz_attempts a
      WHERE a.id = quiz_attempt_question_snapshots.attempt_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.quiz_attempt_question_snapshots IS
  'Immutable snapshot of the exact question content served in an attempt; protects history when a question is corrected or retired.';

NOTIFY pgrst, 'reload schema';

COMMIT;
