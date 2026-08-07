-- Interim: plain per-column trigram indexes for the OLD global-search query.
--
-- Applied to prod 2026-08-07 BEFORE the job_search_index work (20260807_*.sql)
-- because /jobs/search/global was returning 503 on live traffic and the code
-- change had not shipped yet. These indexes fix the query that is deployed
-- right now; the materialized-view path replaces it.
--
-- Why plain columns and not the trigram indexes that already existed: neither
-- existing one was usable for the natural query text.
--
--   idx_jobs_company_name_trgm   partial on `btrim(company_name) <> ''`, which
--                                the planner cannot prove from an ILIKE
--   idx_jobs_job_title_trgm      indexed on the EXPRESSION coalesce(job_title,'')
--                                rather than on the column
--
-- Proven on prod, identical query and rows:
--   job_title ILIKE '%quantum%'                   6,972ms   (no index used)
--   coalesce(job_title,'') ILIKE '%quantum%'        265ms   (index used)
--
-- With all five columns indexed the planner produces a BitmapOr and the live
-- endpoint stopped 503ing: q=engineer 8,011ms/503 -> 5,747ms/200,
-- q=quantum 8,011ms/503 -> 241ms/200. Still too slow, which is what
-- 20260807_job_search_index.sql addresses.
--
-- ⚠️ ONCE the search_jobs_global RPC path is live on `main`, these four become
-- dead weight — matching happens against job_search_index, not against these
-- columns — and they should be dropped so `jobs` writes stop maintaining four
-- extra GIN indexes. Do NOT drop them before that merge or search 503s again.
-- The two indexes named above are also still unusable and are separate
-- candidates for removal; see 20260806_jobs_company_name_trgm_usable.sql.
--
-- Applied CONCURRENTLY (no write lock). CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction, so re-running this file needs it outside one.

create index concurrently if not exists idx_jobs_job_title_trgm_all
  on public.jobs using gin (job_title gin_trgm_ops);

create index concurrently if not exists idx_jobs_location_city_trgm
  on public.jobs using gin (location_city gin_trgm_ops);

create index concurrently if not exists idx_jobs_location_country_trgm
  on public.jobs using gin (location_country gin_trgm_ops);

create index concurrently if not exists idx_jobs_role_domain_trgm
  on public.jobs using gin (role_domain gin_trgm_ops);
