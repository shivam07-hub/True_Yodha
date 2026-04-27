-- Normalise jobs.main_skills / side_skills into a FK-enforced join table.
--
-- job_skills.skill_id → skills.id (FK to Lightcast taxonomy)
-- Ensures every skill stored against a job is a valid taxonomy entry.
--
-- A trigger keeps job_skills in sync when the scraper writes to
-- jobs.main_skills / jobs.side_skills (the legacy column path).
-- Once the scraper is updated to write to job_skills directly, the
-- trigger and legacy columns can be dropped.

-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_skills (
  id         BIGSERIAL    PRIMARY KEY,
  job_id     TEXT         NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  skill_id   INT          NOT NULL REFERENCES skills(id),
  is_primary BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE (job_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_job_skills_job_id   ON job_skills(job_id);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill_id ON job_skills(skill_id);

ALTER TABLE job_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_skills public read" ON job_skills;
CREATE POLICY "job_skills public read" ON job_skills FOR SELECT USING (true);

-- ── 2. Sync trigger (scraper backward-compat) ─────────────────────────────────

CREATE OR REPLACE FUNCTION sync_job_skills_from_arrays()
RETURNS TRIGGER AS $$
DECLARE
  s    TEXT;
  sid  INT;
BEGIN
  DELETE FROM job_skills WHERE job_id = NEW.job_id;

  IF NEW.main_skills IS NOT NULL THEN
    FOREACH s IN ARRAY NEW.main_skills LOOP
      SELECT id INTO sid FROM skills WHERE taxonomy_key = s;
      IF sid IS NOT NULL THEN
        INSERT INTO job_skills (job_id, skill_id, is_primary)
        VALUES (NEW.job_id, sid, true)
        ON CONFLICT (job_id, skill_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF NEW.side_skills IS NOT NULL THEN
    FOREACH s IN ARRAY NEW.side_skills LOOP
      SELECT id INTO sid FROM skills WHERE taxonomy_key = s;
      IF sid IS NOT NULL THEN
        INSERT INTO job_skills (job_id, skill_id, is_primary)
        VALUES (NEW.job_id, sid, false)
        ON CONFLICT (job_id, skill_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_job_skills ON jobs;
CREATE TRIGGER trg_sync_job_skills
AFTER INSERT OR UPDATE OF main_skills, side_skills ON jobs
FOR EACH ROW EXECUTE FUNCTION sync_job_skills_from_arrays();

-- ── 3. Backfill existing jobs ─────────────────────────────────────────────────

INSERT INTO job_skills (job_id, skill_id, is_primary)
SELECT DISTINCT j.job_id, s.id, true
FROM jobs j, unnest(j.main_skills) AS t(skill_name)
JOIN skills s ON s.taxonomy_key = t.skill_name
WHERE j.main_skills IS NOT NULL
ON CONFLICT (job_id, skill_id) DO NOTHING;

INSERT INTO job_skills (job_id, skill_id, is_primary)
SELECT DISTINCT j.job_id, s.id, false
FROM jobs j, unnest(j.side_skills) AS t(skill_name)
JOIN skills s ON s.taxonomy_key = t.skill_name
WHERE j.side_skills IS NOT NULL
ON CONFLICT (job_id, skill_id) DO NOTHING;
