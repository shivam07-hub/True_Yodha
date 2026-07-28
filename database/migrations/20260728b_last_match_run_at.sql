-- 20260728b_last_match_run_at.sql
-- "Since your last SEARCH" needs a marker only a search can move.
--
-- The baseline was MAX(user_job_matches.computed_at), but that table has three
-- writers: the match run, `on_demand.ensure_job_eval` (opening a job), and the
-- feed warmer. Both of the latter stamp `computed_at = now()` for a single cached
-- eval — so merely BROWSING the feed reset the user's baseline, the new-inventory
-- count collapsed to 0, and the announcement retired itself without the user ever
-- running a search. Caught on the QA account: 7,112 → 0 on a page load.
--
-- `user_profiles.last_match_run_at` has exactly one writer (`match_run.run_match`).
-- Backfilled from the current MAX so nobody sees a false "everything is new".

alter table public.user_profiles
    add column if not exists last_match_run_at timestamptz;

update public.user_profiles p
   set last_match_run_at = m.last_computed
  from (
        select user_id, max(computed_at) as last_computed
          from public.user_job_matches
         group by user_id
       ) m
 where m.user_id = p.id
   and p.last_match_run_at is null;
