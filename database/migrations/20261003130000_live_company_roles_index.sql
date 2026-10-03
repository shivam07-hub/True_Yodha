-- /intel's Open Roles panel: the newest live roles at one company.
--
-- `list_jobs_at_company` filtered on company_name and ordered by first_seen
-- with no index behind that ORDER BY, so a LIMIT 6 still sorted every row the
-- company had: 17,844 for Axis Bank, 10.6s, past the 8s PostgREST timeout
-- (`capacity_503:upstream.read_timeout`, 2026-10-01). It also had no liveness
-- filter, so the panel titled "Open roles" listed closed ones.
--
-- The read now asks for live rows only, and this index answers it in order:
-- 10,633ms -> 1.5ms for Axis Bank (2026-10-03). Its predicate is the same one
-- `company_open_roles_page` and `idx_jobs_lower_company_active_jobid` use.
--
-- CONCURRENTLY: `jobs` takes verifier writes all day. Applied on Supabase
-- outside a transaction (CREATE INDEX CONCURRENTLY cannot run inside one).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_live_company_first_seen
    ON public.jobs (company_name, first_seen DESC)
    WHERE is_active AND listing_confidence = 'active';
