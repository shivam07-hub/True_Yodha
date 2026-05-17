-- CV Builder v2 — Playground + immutable Git-commit versioning (2026-05-17 grill-me session)
-- Locks: Q7 (cv_history.cv_structured JSONB), Q10/Q11 (per-job versions on job_cv_variants),
-- Q18c (no delete — immutable), Q18d (parent_version_id chain), Q18e (edited_items per version).
--
-- Run order: deploy backend that writes cv_structured + hidden_items, then run this.
-- Old job_cv_variants rows survive — they get NULL job_version_number and are backfilled below.

-- ── cv_history: structured JSON payload ────────────────────────────────────
-- Populated lazily on /cv visit when NULL. Single LLM call returns skills + structure.

ALTER TABLE cv_history
  ADD COLUMN IF NOT EXISTS cv_structured JSONB;

-- ── job_cv_variants: Git-commit-style per-job versions ─────────────────────
-- Each Save / Polish / Edit = new immutable row.
-- parent_version_id links polish + edit children back to their source row.

ALTER TABLE job_cv_variants
  ADD COLUMN IF NOT EXISTS job_version_number INTEGER,
  ADD COLUMN IF NOT EXISTS parent_version_id  INTEGER REFERENCES job_cv_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edited_items       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS title              TEXT,
  ADD COLUMN IF NOT EXISTS version_kind       VARCHAR(20)
    CHECK (version_kind IN ('deterministic','polished','edited'));

-- Backfill job_version_number for existing rows: per (user_id, job_id), order by created_at ASC.
WITH numbered AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, job_id ORDER BY created_at) AS rn
  FROM job_cv_variants
  WHERE job_version_number IS NULL
)
UPDATE job_cv_variants v
   SET job_version_number = numbered.rn
  FROM numbered
 WHERE v.id = numbered.id;

-- Backfill version_kind from existing ai_polished flag.
UPDATE job_cv_variants
   SET version_kind = CASE WHEN ai_polished THEN 'polished' ELSE 'deterministic' END
 WHERE version_kind IS NULL;

ALTER TABLE job_cv_variants
  ALTER COLUMN job_version_number SET NOT NULL,
  ALTER COLUMN version_kind       SET NOT NULL;

-- Drop the snapshot_hash uniqueness — user-curated cuts can collapse to the same hash.
-- Add monotonic per-job version uniqueness instead.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
    FROM pg_constraint
   WHERE conrelid = 'job_cv_variants'::regclass
     AND contype  = 'u'
     AND conname LIKE '%snapshot_hash%';
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE job_cv_variants DROP CONSTRAINT %I', fk_name);
  END IF;
END$$;

ALTER TABLE job_cv_variants
  ADD CONSTRAINT uniq_user_job_version UNIQUE (user_id, job_id, job_version_number);

CREATE INDEX IF NOT EXISTS idx_job_cv_variants_parent
  ON job_cv_variants (parent_version_id);

CREATE INDEX IF NOT EXISTS idx_job_cv_variants_user_job_version
  ON job_cv_variants (user_id, job_id, job_version_number DESC);
