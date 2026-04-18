-- ============================================================
-- Migration: Flatten 3-table skill hierarchy → single skills table
--
-- Before: skill_domains (L1) + skill_clusters (L2) + skills.cluster_id FK
-- After:  skills table only — l1_domain + l2_cluster columns per row
--
-- Run in Supabase SQL Editor.
-- All 35,108 skills already have category/subcategory populated.
-- ============================================================

-- 1. Rename existing text columns
ALTER TABLE skills RENAME COLUMN category    TO l1_domain;
ALTER TABLE skills RENAME COLUMN subcategory TO l2_cluster;

-- 2. Drop FK column (no longer needed — hierarchy is denormalized)
ALTER TABLE skills DROP COLUMN IF EXISTS cluster_id;

-- 3. Add indexes for hierarchy queries and grouping
CREATE INDEX IF NOT EXISTS idx_skills_l1_domain  ON skills(l1_domain);
CREATE INDEX IF NOT EXISTS idx_skills_l2_cluster ON skills(l2_cluster);

-- 4. Drop old indexes (from the FK column)
DROP INDEX IF EXISTS idx_skills_cluster;
DROP INDEX IF EXISTS idx_skill_clusters_domain;
DROP INDEX IF EXISTS idx_skill_clusters_name;
DROP INDEX IF EXISTS idx_skill_domains_name;

-- 5. Drop the now-redundant lookup tables
DROP TABLE IF EXISTS skill_clusters;
DROP TABLE IF EXISTS skill_domains;
