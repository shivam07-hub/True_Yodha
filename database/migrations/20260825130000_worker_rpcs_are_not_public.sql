-- Six pipeline RPCs were executable by `anon`. They are worker-only.
--
-- Found while auditing S15 row 5 (the invoker-function sweep). The row said
-- "callable by `authenticated`"; the measurement says `anon` as well:
--
--   proname                          authed  anon  service_role
--   claim_jobs_for_skill_floor         t      t         t
--   claim_jobs_for_skill_judgment      t      t         t
--   count_jobs_awaiting_judgment       t      t         t
--   count_jobs_missing_skill_floor     t      t         t
--   refresh_job_role_family            t      t         t
--   release_skill_judgment_claim       t      t         t
--
-- This is not a latency row. `claim_jobs_for_skill_floor(p_limit)` selects
-- FOR UPDATE SKIP LOCKED and stamps the job's attempt column, so an
-- unauthenticated caller can repeatedly claim work off the ingest queue and
-- mark it attempted without ever doing it — the queue drains, the skill floor
-- never gets written, and nothing in the pipeline reports a failure because
-- from its point of view the work was handed out normally.
-- `release_skill_judgment_claim(p_job_ids text[])` is the mirror: it releases
-- claims for an arbitrary caller-supplied job list.
--
-- Every real caller is service_role:
--
--   claim_jobs_for_skill_floor      services/skill_floor.py  <- workers/skill_floor_cli
--   count_jobs_missing_skill_floor  services/skill_floor.py  <- same
--   claim_jobs_for_skill_judgment   workers/skill_judgment_cli.py (admin_batch)
--   release_skill_judgment_claim    workers/skill_judgment_cli.py (admin_batch)
--   count_jobs_awaiting_judgment    workers/skill_judgment_cli.py (admin_batch)
--   refresh_job_role_family         a TRIGGER function — never called directly
--
-- `routers/internal.py` reaches this pipeline too, and it already uses
-- get_supabase_admin() behind require_scrape_webhook.
--
-- A trigger function does not need EXECUTE to fire, so revoking
-- refresh_job_role_family costs nothing and closes a function that should
-- never have had a direct caller in the first place.
--
-- Reversible: re-grant to anon, authenticated.

revoke execute on function public.claim_jobs_for_skill_floor(integer) from anon, authenticated;
revoke execute on function public.claim_jobs_for_skill_judgment(integer) from anon, authenticated;
revoke execute on function public.release_skill_judgment_claim(text[]) from anon, authenticated;
revoke execute on function public.refresh_job_role_family() from anon, authenticated;
revoke execute on function public.count_jobs_awaiting_judgment() from anon, authenticated;
revoke execute on function public.count_jobs_missing_skill_floor() from anon, authenticated;

-- Belt: PUBLIC carries a default EXECUTE grant on new functions, and anon and
-- authenticated inherit through it. Revoking the role grants alone leaves that
-- path open.
revoke execute on function public.claim_jobs_for_skill_floor(integer) from public;
revoke execute on function public.claim_jobs_for_skill_judgment(integer) from public;
revoke execute on function public.release_skill_judgment_claim(text[]) from public;
revoke execute on function public.refresh_job_role_family() from public;
revoke execute on function public.count_jobs_awaiting_judgment() from public;
revoke execute on function public.count_jobs_missing_skill_floor() from public;

grant execute on function public.claim_jobs_for_skill_floor(integer) to service_role;
grant execute on function public.claim_jobs_for_skill_judgment(integer) to service_role;
grant execute on function public.release_skill_judgment_claim(text[]) to service_role;
grant execute on function public.count_jobs_awaiting_judgment() to service_role;
grant execute on function public.count_jobs_missing_skill_floor() to service_role;
