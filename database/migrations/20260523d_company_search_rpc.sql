-- Compact company autocomplete read path.
-- Avoids per-keystroke REST scans over duplicate jobs rows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_jobs_company_name_trgm
  ON jobs USING gin (company_name gin_trgm_ops)
  WHERE company_name IS NOT NULL AND btrim(company_name) <> '';

CREATE OR REPLACE FUNCTION search_job_companies(search_term text, result_limit integer DEFAULT 10)
RETURNS TABLE (company_name text)
LANGUAGE sql
STABLE
AS $$
  WITH cleaned AS (
    SELECT
      lower(btrim(search_term)) AS term,
      greatest(1, least(coalesce(result_limit, 10), 20)) AS scoped_limit
  ),
  escaped AS (
    SELECT
      term,
      replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') AS pattern,
      scoped_limit
    FROM cleaned
    WHERE term <> ''
  ),
  matches AS (
    SELECT DISTINCT
      btrim(j.company_name) AS company_name,
      lower(btrim(j.company_name)) AS company_sort
    FROM jobs j
    CROSS JOIN escaped e
    WHERE j.company_name IS NOT NULL
      AND btrim(j.company_name) <> ''
      AND j.company_name ILIKE '%' || e.pattern || '%' ESCAPE '\'
  )
  SELECT m.company_name
  FROM matches m
  CROSS JOIN escaped e
  ORDER BY
    CASE
      WHEN m.company_sort = e.term THEN 0
      WHEN m.company_sort LIKE e.pattern || '%' ESCAPE '\' THEN 1
      ELSE 2
    END,
    m.company_sort,
    m.company_name
  LIMIT (SELECT scoped_limit FROM escaped);
$$;

GRANT EXECUTE ON FUNCTION search_job_companies(text, integer) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
