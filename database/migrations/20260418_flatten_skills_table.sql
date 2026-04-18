-- ============================================================
-- Migration: Flatten 3-table skill hierarchy → single skills table
--
-- Before: skill_domains (L1) + skill_clusters (L2) + skills.cluster_id FK
-- After:  skills table only — l1_domain + l2_cluster columns per row
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add new columns (nullable until populated)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS l1_domain  VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS l2_cluster VARCHAR(200) NOT NULL DEFAULT '';

-- 2. Populate from the existing FK join
UPDATE skills
SET
    l1_domain  = sd.name,
    l2_cluster = sc.name
FROM skill_clusters sc
JOIN skill_domains  sd ON sc.domain_id = sd.id
WHERE skills.cluster_id = sc.id;

-- 3. Drop FK column (hierarchy now denormalized)
ALTER TABLE skills DROP COLUMN IF EXISTS cluster_id;

-- 4. Add indexes for hierarchy queries and grouping
CREATE INDEX IF NOT EXISTS idx_skills_l1_domain  ON skills(l1_domain);
CREATE INDEX IF NOT EXISTS idx_skills_l2_cluster ON skills(l2_cluster);

-- 5. Drop old indexes
DROP INDEX IF EXISTS idx_skills_cluster;
DROP INDEX IF EXISTS idx_skill_clusters_domain;
DROP INDEX IF EXISTS idx_skill_clusters_name;
DROP INDEX IF EXISTS idx_skill_domains_name;

-- 6. Drop the now-redundant lookup tables
DROP TABLE IF EXISTS skill_clusters;
DROP TABLE IF EXISTS skill_domains;
