-- 20260518_cv_versions_unify.sql
-- Unify cv_history (baseline) + job_cv_variants (per-job) into one cv_versions table.
-- Destructive single-shot: drops both source tables + user_profiles.cv_raw_text + cv_parsed_at.
--
-- Decisions locked in grilling session 2026-05-18:
--   Q1 cv_versions canonical (drop user_profiles.cv_raw_text)
--   Q2 snapshot cv_structured on every row (audit-clean)
--   Q3 drop legacy version_type='generated_draft' rows
--   Q4 destructive single-shot
--   Q5 single global user_version_number per user, across kinds
--   Q6 loose parent rules (parent owned by same user, no job_id alignment CHECK)
--   Q7 derivatives stay snapshotted on baseline rework; UI shows stale badge
--   Q8 drop generated_draft rows entirely (no migration mapping)
--   Q9 materialized baseline_version_id column
--  Q10 unified /cv/versions endpoint surface
--  Q11 user_version_number backfill order: baselines first then per-job
--  Q12 sidebar folds into VersionPicker
--
-- See CONTEXT.md for the durable domain vocabulary (CV Version, CV Lineage, Writer Seam).

BEGIN;

-- ─── 1. CREATE cv_versions ──────────────────────────────────────────────────

CREATE TABLE cv_versions (
  id                    SERIAL       PRIMARY KEY,
  user_id               UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_id                TEXT         REFERENCES jobs(job_id) ON DELETE CASCADE,
  kind                  VARCHAR(30)  NOT NULL
                        CHECK (kind IN ('baseline_upload','deterministic','polished','edited')),
  user_version_number   INTEGER      NOT NULL,
  parent_version_id     INTEGER      REFERENCES cv_versions(id) ON DELETE SET NULL,
  baseline_version_id   INTEGER      REFERENCES cv_versions(id) ON DELETE SET NULL,
  title                 VARCHAR(200),
  cv_structured         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  body_text             TEXT         NOT NULL DEFAULT '',
  polished_text         TEXT,
  hidden_items          JSONB        NOT NULL DEFAULT '[]'::jsonb,
  edited_items          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash         VARCHAR(64),
  confidence_label      VARCHAR(40),
  proof_count           INTEGER      NOT NULL DEFAULT 0,
  ai_polished           BOOLEAN      NOT NULL DEFAULT FALSE,
  ai_polish_used_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, user_version_number),
  -- Kind ↔ job_id consistency: baselines have no job, derivatives must have one.
  CHECK (
    (kind = 'baseline_upload' AND job_id IS NULL)
    OR (kind <> 'baseline_upload' AND job_id IS NOT NULL)
  )
);

CREATE INDEX idx_cv_versions_user_ver  ON cv_versions(user_id, user_version_number DESC);
CREATE INDEX idx_cv_versions_user_job  ON cv_versions(user_id, job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_cv_versions_baseline  ON cv_versions(user_id, created_at DESC) WHERE kind = 'baseline_upload';

-- ─── 2. BACKFILL Phase A — baselines from cv_history ────────────────────────
-- Drop generated_draft rows (Q3/Q8). Renumber baselines 1..N per user.

WITH ordered_baselines AS (
  SELECT
    id,
    user_id,
    uploaded_at,
    cv_raw_text,
    cv_structured,
    title,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY uploaded_at ASC, id ASC) AS new_n
  FROM cv_history
  WHERE version_type = 'baseline_upload'
)
INSERT INTO cv_versions (
  user_id, job_id, kind, user_version_number,
  parent_version_id, baseline_version_id,
  title, cv_structured, body_text, created_at
)
SELECT
  user_id,
  NULL,
  'baseline_upload',
  new_n,
  NULL,
  NULL,
  COALESCE(title, 'Uploaded baseline CV'),
  COALESCE(cv_structured, '{}'::jsonb),
  COALESCE(cv_raw_text, ''),
  uploaded_at
FROM ordered_baselines;

-- ─── 3. BACKFILL Phase B — derivatives from job_cv_variants ─────────────────
-- Renumber continuing the user's baseline sequence.
-- Build a temp map old_variant_id -> new_cv_versions_id so we can rewire parent_version_id in Phase C.

CREATE TEMP TABLE _variant_map (
  old_id INTEGER PRIMARY KEY,
  new_id INTEGER NOT NULL
);

WITH base_max AS (
  SELECT user_id, COALESCE(MAX(user_version_number), 0) AS bm
  FROM cv_versions
  WHERE kind = 'baseline_upload'
  GROUP BY user_id
),
ordered_variants AS (
  SELECT
    v.id              AS old_id,
    v.user_id,
    v.job_id,
    v.version_kind,
    v.title,
    v.deterministic_text,
    v.polished_text,
    v.hidden_items,
    v.edited_items,
    v.snapshot_hash,
    v.confidence_label,
    v.proof_count,
    v.ai_polished,
    v.ai_polish_used_at,
    v.created_at,
    v.parent_version_id AS old_parent,
    COALESCE(bm.bm, 0) + ROW_NUMBER() OVER (
      PARTITION BY v.user_id ORDER BY v.created_at ASC, v.id ASC
    ) AS new_n
  FROM job_cv_variants v
  LEFT JOIN base_max bm ON bm.user_id = v.user_id
),
inserted AS (
  INSERT INTO cv_versions (
    user_id, job_id, kind, user_version_number,
    parent_version_id, baseline_version_id,
    title, cv_structured, body_text, polished_text,
    hidden_items, edited_items,
    snapshot_hash, confidence_label, proof_count,
    ai_polished, ai_polish_used_at, created_at
  )
  SELECT
    user_id,
    job_id,
    COALESCE(version_kind, 'deterministic'),
    new_n,
    NULL,                                  -- parent_version_id resolved in Phase C
    NULL,                                  -- baseline_version_id resolved in Phase D
    title,
    '{}'::jsonb,                           -- legacy variants have no structured snapshot; readers fall back to body_text
    COALESCE(deterministic_text, ''),
    polished_text,
    COALESCE(hidden_items, '[]'::jsonb),
    COALESCE(edited_items, '{}'::jsonb),
    snapshot_hash,
    confidence_label,
    COALESCE(proof_count, 0),
    COALESCE(ai_polished, FALSE),
    ai_polish_used_at,
    created_at
  FROM ordered_variants
  RETURNING id, user_id, user_version_number
)
INSERT INTO _variant_map (old_id, new_id)
SELECT ov.old_id, ins.id
FROM ordered_variants ov
JOIN inserted ins
  ON ins.user_id = ov.user_id
 AND ins.user_version_number = ov.new_n;

-- ─── 4. BACKFILL Phase C — rewire parent_version_id via map ─────────────────

UPDATE cv_versions cv
SET parent_version_id = m_new.new_id
FROM job_cv_variants old
JOIN _variant_map m_old ON m_old.old_id = old.id
JOIN _variant_map m_new ON m_new.old_id = old.parent_version_id
WHERE cv.id = m_old.new_id
  AND old.parent_version_id IS NOT NULL;

-- ─── 5. BACKFILL Phase D — materialize baseline_version_id ──────────────────
-- For each derivative, find the latest baseline at or before its created_at.

UPDATE cv_versions cv
SET baseline_version_id = (
  SELECT b.id
  FROM cv_versions b
  WHERE b.user_id = cv.user_id
    AND b.kind = 'baseline_upload'
    AND b.created_at <= cv.created_at
  ORDER BY b.created_at DESC
  LIMIT 1
)
WHERE cv.kind <> 'baseline_upload';

-- Orphan-derivative policy (Q2 in earlier audit, skipped per "no real users"):
-- Any derivative whose user has no baseline_upload row keeps baseline_version_id = NULL.
-- Post-cutover writes are forbidden from this state (repo enforces NOT NULL).
-- Legacy orphan rows remain readable but cannot be polished/edited further.

DROP TABLE _variant_map;

-- ─── 6. RLS + policy ────────────────────────────────────────────────────────

ALTER TABLE cv_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own cv versions" ON cv_versions;
CREATE POLICY "own cv versions" ON cv_versions
  FOR ALL USING (auth.uid() = user_id);

-- ─── 7. DROP legacy ─────────────────────────────────────────────────────────

DROP TABLE job_cv_variants;
DROP TABLE cv_history;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS cv_raw_text,
  DROP COLUMN IF EXISTS cv_parsed_at;

COMMIT;

-- PostgREST schema cache must be reloaded after schema changes
-- (per feedback memory: stale cache = phantom "column does not exist" errors).
NOTIFY pgrst, 'reload schema';
