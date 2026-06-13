-- Issue #21(1b): /jobs/my-skills/demand was 5–6s.
--
-- Root cause: get_user_skill_demand_snapshot fetched EVERY job_skills row for the
-- user's skills (fetch_all_rows, paginating tens of thousands of rows for a common
-- skill) and counted them in Python. The count belongs in the database.
--
-- This GROUP BY aggregate returns one row per skill instead of the full row set,
-- collapsing the wire payload + Python loop to a single indexed scan + group.
-- Semantics match the prior Python exactly: job_count = rows per skill,
-- weighted_demand = sum(2 for primary, else 1). No date filter — preserves the
-- existing (all-time) behaviour despite the field's legacy _30d name; tightening
-- that to a real 30-day window is a separate, product-visible change.
--
-- The repo calls this via RPC with a graceful fallback to the old row-scan path,
-- so the backend is correct before AND after this migration is applied. Apply
-- manually (database/migrations are not auto-run) then: NOTIFY pgrst, 'reload schema';

create or replace function count_job_demand_for_skills(p_skill_ids int[])
returns table (skill_id int, job_count int, weighted_demand int)
language sql
stable
as $$
  select
    js.skill_id,
    count(*)::int                                          as job_count,
    sum(case when js.is_primary then 2 else 1 end)::int    as weighted_demand
  from job_skills js
  where js.skill_id = any(p_skill_ids)
  group by js.skill_id;
$$;
