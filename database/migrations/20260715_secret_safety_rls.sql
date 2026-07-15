-- Secret-safety hardening: every table in the exposed public schema must have
-- RLS enabled before the browser can use the Supabase anon key.
--
-- Internal tables intentionally receive no anon/authenticated policies. The
-- API accesses them through the service-role client, while the two taxonomy
-- lookup tables retain explicit public read-only policies.

ALTER TABLE IF EXISTS public.job_feed_run_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_skill_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.magic_link_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_analytics_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.skill_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.skill_clusters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.job_feed_run_audits FROM anon, authenticated;
REVOKE ALL ON TABLE public.job_skill_candidates FROM anon, authenticated;
REVOKE ALL ON TABLE public.magic_link_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.market_analytics_snapshot FROM anon, authenticated;
REVOKE ALL ON TABLE public.newsletter_subscribers FROM anon, authenticated;

DROP POLICY IF EXISTS "skill domains public read" ON public.skill_domains;
CREATE POLICY "skill domains public read"
    ON public.skill_domains
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "skill clusters public read" ON public.skill_clusters;
CREATE POLICY "skill clusters public read"
    ON public.skill_clusters
    FOR SELECT
    TO anon, authenticated
    USING (true);

NOTIFY pgrst, 'reload schema';
