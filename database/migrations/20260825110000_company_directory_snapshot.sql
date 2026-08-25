-- indexable_companies(): the SEO company list stops sweeping the jobs heap.
--
-- MEASURED on prod 2026-08-25:
--
--   service_role     706 ms / 12,654 buffers
--   anon           3,257 ms / 13,054 buffers
--
-- Note what that first row says: it full-scans the heap even as service_role.
-- This one is NOT trap 5 — RLS makes it 4.6x worse, it was never fast. It is a
-- global GROUP BY over every trusted-active job, run to produce 232 rows.
--
-- 12,654 buffers is the whole `jobs` heap (100MB ~ 12,800 blocks) against a
-- 224MB shared_buffers. That is the eviction described in
-- ARCHITECTURE_READ_PATH.md S16: on 2026-08-20 four unrelated routes finished
-- within 33ms of each other at ~14.7s, and on 2026-08-24 five finished within
-- 1.7s of each other at ~7.2-8.9s. A single call here takes 45% of the cache
-- with it, and everything queued behind it lands at the same wall time.
--
-- The route is already shared-cached, which is why the alert range is
-- 2,870-9,590ms rather than constant: those are the cold fills and the stale
-- refreshes. Caching a heap scan does not stop the heap scan; it only makes it
-- less frequent. Precomputing it does.
--
-- There is no per-caller input at all — the function takes no arguments. It is
-- a textbook Tier-0 (playbook fix order #1), the same shape as
-- 20260825100000, and it reuses the same lease machinery.

-- `name` is the primary key, NOT lower(name). The function this replaces
-- groups by `btrim(company_name)` case-SENSITIVELY, so "Apple" and "APPLE"
-- are two directory entries today. Keying on lower() would silently merge
-- them and change the row count — a behaviour change wearing a refactor's
-- clothes. `sort_key` carries the lower() only for the emitted order, which
-- is what the original tiebreaks on.
create table if not exists public.company_directory (
  name         text primary key,
  sort_key     text        not null,
  active_count integer     not null default 0,
  refreshed_at timestamptz not null default now()
);

comment on table public.company_directory is
  'Tier-0 snapshot: companies with at least one trusted-active listing, and '
  'that count. Feeds indexable_companies() / the SEO company list. Public '
  'aggregate over public jobs. See migration 20260825110000.';

-- The emitted order is load-bearing for the sitemap (busiest first, then
-- alphabetical), and it is a function of the snapshot's own columns — so it is
-- reproduced in the reader's ORDER BY rather than stored as a rank.
create index if not exists idx_company_directory_rank
  on public.company_directory (active_count desc, sort_key asc);

alter table public.company_directory enable row level security;

drop policy if exists "company directory is public" on public.company_directory;
create policy "company directory is public"
  on public.company_directory for select using (true);

create or replace function public.refresh_company_directory()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now  timestamptz := now();
  v_rows integer;
begin
  with fresh as (
    select btrim(j.company_name)        as name,
           lower(btrim(j.company_name)) as sort_key,
           count(*)::integer            as active_count
    from public.jobs as j
    where j.is_active is true
      and j.listing_confidence = 'active'
      and j.company_name is not null
      and btrim(j.company_name) <> ''
    group by btrim(j.company_name)
  ), upserted as (
    insert into public.company_directory (name, sort_key, active_count, refreshed_at)
    select name, sort_key, active_count, v_now from fresh
    on conflict (name) do update
      set sort_key = excluded.sort_key,
          active_count = excluded.active_count,
          refreshed_at = excluded.refreshed_at
    returning name
  )
  select count(*)::integer into v_rows from upserted;

  -- A company whose last live listing closed must leave the sitemap, or we
  -- keep offering Google a page that renders nothing.
  delete from public.company_directory where refreshed_at <> v_now;

  return jsonb_build_object('companies', v_rows, 'refreshed_at', v_now);
end;
$$;

revoke all on function public.refresh_company_directory() from public;
grant execute on function public.refresh_company_directory() to service_role;

-- SEED BEFORE SWAP — dev and prod share one database.
select public.refresh_company_directory();

-- Same signature, same rows, same order. `active_count` stays bigint because
-- the response schema and every caller already read it as one.
create or replace function public.indexable_companies()
returns table (name text, active_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select d.name, d.active_count::bigint
  from public.company_directory d
  order by d.active_count desc, d.sort_key asc;
$$;

revoke all on function public.indexable_companies() from public;
grant execute on function public.indexable_companies() to anon, authenticated, service_role;

alter table public.snapshot_refresh_state
  drop constraint if exists snapshot_refresh_state_task_check;
alter table public.snapshot_refresh_state
  add constraint snapshot_refresh_state_task_check
  check (task = any (array['analytics', 'skill_demand', 'job_search',
                           'role_families', 'company_directory']));

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('company_directory', 'pending', 'migration_20260825110000')
on conflict (task) do nothing;
