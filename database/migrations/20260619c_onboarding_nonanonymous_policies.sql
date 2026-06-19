-- CV-derived onboarding data requires a normal signed-in account. Supabase
-- anonymous-auth users carry the authenticated role, so reject them explicitly.

DROP POLICY IF EXISTS user_onboarding_state_select_own
    ON public.user_onboarding_state;
CREATE POLICY user_onboarding_state_select_own
    ON public.user_onboarding_state
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::BOOLEAN, FALSE) = FALSE
    );

DROP POLICY IF EXISTS cv_skill_overrides_select_own
    ON public.cv_skill_overrides;
CREATE POLICY cv_skill_overrides_select_own
    ON public.cv_skill_overrides
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::BOOLEAN, FALSE) = FALSE
    );

NOTIFY pgrst, 'reload schema';
