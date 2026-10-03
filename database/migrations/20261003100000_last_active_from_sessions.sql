-- user_profiles.last_active_at becomes true (Shivam, 2026-10-02).
--
-- It was written once, at signup (DEFAULT now()), and never again: on
-- 2026-10-02 it equalled created_at for 947 of 947 people, so every "active"
-- count read off it was a signup count. Supabase already records each visit —
-- a session's refreshed_at moves whenever the client refreshes its token — so
-- the truth is copied from there once a day. Nothing writes on the request
-- path (/users/me is the hottest read in the app), and the value only ever
-- moves forward.

create or replace function public.refresh_last_active()
returns integer
language sql
security definer
set search_path to ''
as $$
  with seen as (
    select s.user_id,
           max(greatest(
             s.created_at,
             s.updated_at,
             s.refreshed_at at time zone 'UTC'   -- stored without a zone, in UTC
           )) as seen_at
      from auth.sessions s
     group by s.user_id
  ), moved as (
    update public.user_profiles p
       set last_active_at = seen.seen_at
      from seen
     where seen.user_id = p.id
       and seen.seen_at > p.last_active_at
    returning 1
  )
  select count(*)::integer from moved;
$$;

-- Server-side only: never reachable as a PostgREST RPC.
revoke all on function public.refresh_last_active() from public, anon, authenticated;

-- 00:20 UTC is ~05:50 IST, before India's day starts.
select cron.schedule(
  'last-active-daily-refresh',
  '20 0 * * *',
  $$select public.refresh_last_active();$$
);
