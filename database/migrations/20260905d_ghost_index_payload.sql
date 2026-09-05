-- Ghost Job Index — the public read.
--
-- One RPC, one round trip, no row cap. The alternative (four PostgREST reads,
-- or one wide select shaped in Python) costs ~165ms per hop on this path and
-- puts the payload within reach of the 1000-row ceiling, which truncates
-- SILENTLY. An index that quietly loses its tail is worse than one that is late.
--
-- Invoker, not definer: `ghost_index_snapshot`'s policy is `using (true)`, so
-- the anon plan is already the index scan (5.0ms, 13 buffers, all hits). A
-- definer here would buy nothing and add an oracle to audit.
--
-- The payload carries its own coverage statement. A reader must be able to see
-- what the index does NOT cover without leaving the response.

create or replace function public.ghost_index_payload()
returns jsonb
language sql
stable
as $$
  with overall as (
    select * from ghost_index_snapshot where scope = 'overall' and period = 'all'
  ),
  months as (
    select * from ghost_index_snapshot
     where scope = 'overall' and period <> 'all'
       -- A cohort too small to say anything is noise on a chart.
       and listings_closed >= 20
     order by period
  ),
  companies as (
    select * from ghost_index_snapshot
     where scope = 'company' and period = 'all' and still_advertised_rate is not null
     order by still_advertised_rate desc, feed_overlap desc
  ),
  sectors as (
    select * from ghost_index_snapshot
     where scope = 'sector' and period = 'all' and still_advertised_rate is not null
     order by still_advertised_rate desc, feed_overlap desc
  )
  select jsonb_build_object(
    'method', (select method_version from overall),
    'computed_at', (select computed_at from overall),
    'overall', (select to_jsonb(o) - 'scope' - 'scope_key' - 'method_version' from overall o),
    'months', coalesce((select jsonb_agg(to_jsonb(m) - 'scope' - 'scope_key' - 'method_version')
                          from months m), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(to_jsonb(c) - 'scope' - 'method_version'
                                            - 'listings_conclusive' - 'listings_live'
                                            - 'listings_inconclusive')
                             from companies c), '[]'::jsonb),
    'sectors', coalesce((select jsonb_agg(to_jsonb(s) - 'scope' - 'method_version'
                                          - 'listings_conclusive' - 'listings_live'
                                          - 'listings_inconclusive')
                           from sectors s), '[]'::jsonb),
    'coverage', jsonb_build_object(
      'min_cell', 20,
      'companies_published', (select count(*) from companies),
      'companies_with_closures', (
        select count(*) from ghost_index_snapshot
         where scope = 'company' and period = 'all' and listings_closed > 0
      ),
      'companies_in_corpus', (
        select count(distinct nullif(btrim(company_name), '')) from jobs
      )
    )
  );
$$;

comment on function public.ghost_index_payload() is
  'The whole public Ghost Job Index in one round trip, including the coverage '
  'statement. Rows below the minimum cell are absent by construction — the '
  'coverage block is how a reader sees they were withheld rather than missing.';

grant execute on function public.ghost_index_payload() to anon, authenticated, service_role;
