-- RPC function: avoids PostgREST URL-length 400 when filtering job_skills
-- by thousands of job_ids. Body-encoded array → no URL limit.
CREATE OR REPLACE FUNCTION fetch_job_skills_by_job_ids(job_ids uuid[])
RETURNS TABLE (job_id uuid, is_primary boolean, taxonomy_key text)
LANGUAGE sql STABLE AS $$
  SELECT js.job_id, js.is_primary, s.taxonomy_key
  FROM job_skills js
  JOIN skills s ON s.id = js.skill_id
  WHERE js.job_id = ANY(job_ids);
$$;

GRANT EXECUTE ON FUNCTION fetch_job_skills_by_job_ids(uuid[]) TO authenticated, service_role;
