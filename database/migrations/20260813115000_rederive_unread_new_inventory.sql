-- Repair the durable projection immediately. The read path also re-derives on
-- every inbox open, so this is a one-time bridge for environments where the
-- backend rollout follows the database migration.

with live as (
  select
    n.id,
    n.user_id,
    public.count_new_jobs_for_user(n.user_id) as live_count
  from public.user_notifications n
  where n.kind = 'new_jobs'
    and n.read_at is null
)
update public.user_notifications n
set
  match_count = live.live_count,
  title = case
    when live.live_count > 0 then
      to_char(live.live_count, 'FM999,999,999,990')
      || ' new role'
      || case when live.live_count = 1 then '' else 's' end
      || ' to search'
    else n.title
  end,
  body = case
    when live.live_count > 0 then
      'Myro found these since your last search. Run a search to see which ones fit you.'
    else n.body
  end,
  read_at = case
    when live.live_count <= 0 then now()
    else n.read_at
  end
from live
where n.id = live.id
  and n.user_id = live.user_id;
