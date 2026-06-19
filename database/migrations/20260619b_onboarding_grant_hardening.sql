-- Legacy projects auto-grant public-table privileges. Keep onboarding data
-- inaccessible to anon and read-only for authenticated users; API writes use
-- the service role with explicit ownership checks.

REVOKE ALL ON public.user_onboarding_state FROM anon, authenticated;
GRANT SELECT ON public.user_onboarding_state TO authenticated;
GRANT ALL ON public.user_onboarding_state TO service_role;

REVOKE ALL ON public.cv_skill_overrides FROM anon, authenticated;
GRANT SELECT ON public.cv_skill_overrides TO authenticated;
GRANT ALL ON public.cv_skill_overrides TO service_role;

NOTIFY pgrst, 'reload schema';
