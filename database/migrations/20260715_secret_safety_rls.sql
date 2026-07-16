-- Secret-safety hardening: every table in the exposed public schema must have
-- RLS enabled before the browser can use the Supabase anon key.
--
-- Internal tables intentionally receive no anon/authenticated policies. The
-- API accesses them through the service-role client. Legacy taxonomy tables
-- are guarded because the current schema uses flattened columns on public.skills
-- instead of public.skill_domains/public.skill_clusters.

ALTER TABLE IF EXISTS public.job_feed_run_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_skill_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.magic_link_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_analytics_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.skill_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.skill_clusters ENABLE ROW LEVEL SECURITY;

DO $block$
BEGIN
  IF to_regclass('public.job_feed_run_audits') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.job_feed_run_audits FROM anon, authenticated';
  END IF;
  IF to_regclass('public.job_skill_candidates') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.job_skill_candidates FROM anon, authenticated';
  END IF;
  IF to_regclass('public.magic_link_attempts') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.magic_link_attempts FROM anon, authenticated';
  END IF;
  IF to_regclass('public.market_analytics_snapshot') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.market_analytics_snapshot FROM anon, authenticated';
  END IF;
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.newsletter_subscribers FROM anon, authenticated';
  END IF;

  IF to_regclass('public.skill_domains') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "skill domains public read" ON public.skill_domains';
    EXECUTE 'CREATE POLICY "skill domains public read"
      ON public.skill_domains
      FOR SELECT
      TO anon, authenticated
      USING (true)';
  END IF;

  IF to_regclass('public.skill_clusters') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "skill clusters public read" ON public.skill_clusters';
    EXECUTE 'CREATE POLICY "skill clusters public read"
      ON public.skill_clusters
      FOR SELECT
      TO anon, authenticated
      USING (true)';
  END IF;
END
$block$;

NOTIFY pgrst, 'reload schema';
