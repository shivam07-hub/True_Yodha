-- The Notice closer runs from pg_cron (Shivam, 2026-10-10).
--
-- It ran as a GitHub Action (`.github/workflows/notice-closer.yml`, deleted with
-- this migration). The Action stopped being scheduled after 2026-10-06 and
-- nothing said so: the closer's dead-man could only reach the operator through
-- the digest the closer itself sends. pg_cron kept running every refresh all
-- that week, so the closer moves onto it — the same rail and the same vault
-- secrets as `analytics-snapshot-daily-refresh`.
--
-- 02:30 UTC is 08:00 IST. The 06:30 UTC job asks again only when the morning
-- pass left no heartbeat, so one failed pass costs hours, not a week; a pass
-- that raises also mails its own failure (`closer.run_or_alert`).

do $$
begin
  perform cron.unschedule(jobid) from cron.job
   where jobname in ('notice-closer-daily', 'notice-closer-retry');
end $$;

select cron.schedule(
  'notice-closer-daily',
  '30 2 * * *',
  $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
              where name = 'myro_api_base_url') || '/internal/notice/close',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Myro-Refresh-Secret',
        (select decrypted_secret from vault.decrypted_secrets
         where name = 'myro_analytics_refresh_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cmd$
);

select cron.schedule(
  'notice-closer-retry',
  '30 6 * * *',
  $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
              where name = 'myro_api_base_url') || '/internal/notice/close',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Myro-Refresh-Secret',
        (select decrypted_secret from vault.decrypted_secrets
         where name = 'myro_analytics_refresh_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where coalesce(
      (select ran_at from public.notice_closer_heartbeat limit 1),
      '-infinity'::timestamptz
    ) < now() - interval '20 hours';
  $cmd$
);
