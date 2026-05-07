-- Ensure fetch_job_skills RPC matches Mirror schema:
-- jobs.job_id and job_skills.job_id are TEXT (not UUID).
-- This avoids PostgREST RPC signature drift and schema-cache misses.

DROP FUNCTION IF EXISTS public.fetch_job_skills_by_job_ids(uuid[]);

CREATE OR REPLACE FUNCTION public.fetch_job_skills_by_job_ids(job_ids text[])
RETURNS TABLE (job_id text, is_primary boolean, taxonomy_key text)
LANGUAGE sql
STABLE
AS $$
  SELECT js.job_id, js.is_primary, s.taxonomy_key
  FROM public.job_skills js
  JOIN public.skills s ON s.id = js.skill_id
  WHERE js.job_id = ANY(job_ids);
$$;

GRANT EXECUTE ON FUNCTION public.fetch_job_skills_by_job_ids(text[]) TO authenticated, service_role;
