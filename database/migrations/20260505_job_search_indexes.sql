-- Performance indexes for job search + analytics access patterns.
-- Required before Phase 3 upload (~140k job_skills rows).

CREATE INDEX IF NOT EXISTS idx_jobs_company_name
  ON jobs(company_name);

CREATE INDEX IF NOT EXISTS idx_jobs_role_domain
  ON jobs(role_domain);

-- Composite covers both job_id-scoped skill fetches AND is_primary filters.
CREATE INDEX IF NOT EXISTS idx_job_skills_job_primary
  ON job_skills(job_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_skills_taxonomy_key
  ON skills(taxonomy_key);