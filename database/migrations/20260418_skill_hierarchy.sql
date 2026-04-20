-- ============================================================
-- Migration: 3-tier Lightcast skill hierarchy
-- Run in Supabase SQL Editor BEFORE running backfill_skills.py
--
-- Creates:
--   skill_domains   (L1 — 31 rows)
--   skill_clusters  (L2 — 442 rows, FK → skill_domains)
--   skills.cluster_id FK → skill_clusters
--
-- After running backfill_skills.py, run the finalize block below.
-- ============================================================

-- ── L1 Domains ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_domains (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(200) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_domains_name ON skill_domains(name);

-- ── L2 Clusters ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_clusters (
  id          SERIAL       PRIMARY KEY,
  domain_id   INTEGER      NOT NULL REFERENCES skill_domains(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  skill_count INTEGER      NOT NULL DEFAULT 0,
  UNIQUE(domain_id, name)
);

CREATE INDEX IF NOT EXISTS idx_skill_clusters_domain ON skill_clusters(domain_id);
CREATE INDEX IF NOT EXISTS idx_skill_clusters_name   ON skill_clusters(name);

-- ── Add cluster_id FK to skills (nullable until backfill) ────
ALTER TABLE skills ADD COLUMN IF NOT EXISTS cluster_id INTEGER REFERENCES skill_clusters(id);
CREATE INDEX IF NOT EXISTS idx_skills_cluster ON skills(cluster_id);

-- ============================================================
-- FINALIZE — run AFTER backfill_skills.py completes
-- (verifies all rows have cluster_id, then drops old columns)
-- ============================================================

-- Uncomment and run after backfill:
-- ALTER TABLE skills ALTER COLUMN cluster_id SET NOT NULL;
-- ALTER TABLE skills DROP COLUMN IF EXISTS category;
-- ALTER TABLE skills DROP COLUMN IF EXISTS subcategory;
