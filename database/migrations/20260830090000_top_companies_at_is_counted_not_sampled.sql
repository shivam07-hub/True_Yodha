-- Company Signals counted the market instead of sampling it.
--
-- `list_top_companies_at` selected `company_name, location_country, first_seen,
-- last_seen` for every job row in a city and grouped them IN PYTHON. Three
-- things were wrong with that and only the third was visible:
--
--   1. No liveness predicate. Every row in `jobs` counted, delisted included.
--   2. No `.limit()`. PostgREST caps a response at 1,000 rows and says nothing
--      about it — so a 22,336-row city was grouped from an arbitrary 1,000-row
--      page, 4.5% of the market. (See the `postgrest batch ceilings` rule: the
--      cap TRUNCATES, it does not error.)
--   3. That page has no ORDER BY, so which 1,000 rows arrive is physical heap
--      order — which shifts under every UPDATE the verifier sweep makes. The
--      widget's numbers therefore changed on their own, and the 24h in-process
--      cache froze whichever arbitrary answer landed first.
--
-- Measured on prod the day this was written: the endpoint reported Accenture
-- with 144 open roles in Bengaluru. Accenture has 1,051 live roles in Bengaluru.
-- Adobe showed 12; Adobe has 101. Not one of the real top four appeared at all.
-- Every number on the panel was a share of an arbitrary page.
--
-- The scope travels as the scope and the aggregate happens in the database, so
-- the answer cannot grow past what one response can carry — the same shape
-- `role_family_market_skills` already uses for the family market.
--
-- Additive and reversible: one new function, two new partial indexes. Nothing
-- is dropped and no existing object changes.

-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so these two
-- sit OUTSIDE the begin/commit below and are applied first.

-- Without these the planner picks `idx_jobs_location_city_trgm` — a GIN trigram
-- index — for an EQUALITY predicate, then rechecks 6,835 heap blocks. Measured
-- 5,736ms for one Bengaluru read. Covering the grouped columns turns it into an
-- index-only scan: 21.9ms, same rows.
create index concurrently if not exists idx_jobs_live_city_company
    on public.jobs (location_city, company_name)
    include (location_country, last_seen, first_seen)
    where is_active is true and listing_confidence = 'active';

create index concurrently if not exists idx_jobs_live_industry_company
    on public.jobs (industry_group, company_name)
    include (location_country, last_seen, first_seen)
    where is_active is true and listing_confidence = 'active';

begin;

create or replace function public.top_companies_at(
    p_kind  text,
    p_value text,
    p_limit integer default 8,
    p_sort  text default 'roles'
)
returns table (
    company_name     text,
    open_count       integer,
    location_country text,
    max_seen         integer
)
language sql
stable
set search_path to 'public'
as $function$
    with scoped as (
        select btrim(j.company_name) as company_name,
               nullif(btrim(j.location_country), '') as location_country,
               -- Markers are yyyymmdd integers. `last_seen` is the truth; a row
               -- the scraper has only ever seen once carries `first_seen` alone,
               -- and the caller's "scraped" sort must not read that as never.
               nullif(greatest(coalesce(j.last_seen, 0), coalesce(j.first_seen, 0)), 0) as seen
        from public.jobs j
        where j.is_active is true
          and j.listing_confidence = 'active'
          and nullif(btrim(j.company_name), '') is not null
          and ((p_kind = 'industry' and j.industry_group = p_value)
            or (p_kind = 'city'     and j.location_city  = p_value))
    ), grouped as (
        select s.company_name,
               count(*)::integer as open_count,
               max(s.seen)::integer as max_seen,
               -- `mode()` ignores nulls, so a company whose rows carry a country
               -- on some listings and not others still reports the country.
               mode() within group (order by s.location_country) as location_country
        from scoped s
        group by s.company_name
    )
    select g.company_name, g.open_count, g.location_country, g.max_seen
    from grouped g
    -- 'roles' makes the first key constant-null for every row, so it collapses
    -- to the open_count order. Company name breaks the tie: a stable answer is
    -- worth more here than an arbitrary one, since this feeds a 24h cache.
    order by (case when p_sort = 'last_seen' then g.max_seen end) desc nulls last,
             g.open_count desc,
             g.company_name
    limit greatest(1, least(20, coalesce(p_limit, 8)));
$function$;

comment on function public.top_companies_at(text, text, integer, text) is
    'Top live-hiring companies in a city or industry group. Counted in the DB — '
    'the caller must never group job rows client-side, which silently truncated '
    'at PostgREST''s 1,000-row cap.';

commit;

notify pgrst, 'reload schema';
