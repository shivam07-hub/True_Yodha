-- Manual apply only: adds the deterministic description-search index used by
-- /jobs/feed q=... so queries like "Post MBA roles" can match JD requirements
-- without running an LLM per row.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_jobs_job_description_trgm
  ON public.jobs
  USING GIN ((COALESCE(job_description, '')) gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
