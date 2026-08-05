-- indexable_companies() — count the 185 rows in the database, not in Python.
--
-- `JobsRepository.fetch_indexable_companies` needed one number per company:
-- how many live listings does it have. It got there by paging every matching
-- row out of Postgres at 1,000 per request and counting them in a dict:
--
--     fetch_all_rows(table="jobs", columns="company_name",
--                    query_builder=... is_active ... listing_confidence ...)
--
-- That is 11,208 rows over the wire, in 12 sequential round trips, to produce
-- 185 rows. Worse, PostgREST paging is LIMIT/OFFSET, and OFFSET re-scans and
-- discards everything before it — so each page costs more than the last.
-- Measured on prod 2026-08-06, one page at offset 10,000: 1,343 ms. Twelve of
-- them is the 9,105 ms / 12,622 ms /jobs/companies/indexable spikes in the
-- saturation alerts.
--
-- The same answer as a single GROUP BY: 346 ms, one round trip, 185 rows.
--
-- Semantics are deliberately byte-identical to the Python this replaces:
--   * group on btrim(company_name), not company_name — the loop did
--     `(r.get("company_name") or "").strip()` before counting, so " Acme" and
--     "Acme" merged into one bucket. Grouping on the raw column would silently
--     split them and change the sitemap.
--   * blank and NULL names are dropped, as `if name:` did.
--   * ordering is (active_count DESC, lower(name) ASC), matching
--     sorted(..., key=lambda kv: (-kv[1], kv[0].casefold())).
--
-- This is the SEO-indexing allowlist: the sitemap emits only these companies
-- and the detail page noindexes itself when it falls out. Getting the set or
-- the ordering wrong changes what Google is told to crawl, which is why the
-- grouping detail above is load-bearing rather than incidental.

create or replace function public.indexable_companies()
returns table(
    name text,
    active_count bigint
)
language sql
stable
set search_path to 'public'
as $$
    select btrim(j.company_name) as name,
           count(*) as active_count
    from public.jobs as j
    where j.is_active is true
      and j.listing_confidence = 'active'
      and j.company_name is not null
      and btrim(j.company_name) <> ''
    group by btrim(j.company_name)
    order by count(*) desc, lower(btrim(j.company_name)) asc;
$$;

comment on function public.indexable_companies() is
  'Companies with >=1 live listing (is_active AND listing_confidence=active), with their live-role count — the sitemap indexing allowlist. One GROUP BY replacing a 12-round-trip OFFSET page-scan of 11,208 rows; grouping is on btrim(company_name) to preserve the caller''s prior strip-then-count semantics.';

notify pgrst, 'reload schema';
