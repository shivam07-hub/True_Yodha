-- Scope saved-job dismissal ownership to signed-in users and evaluate auth.uid
-- once per statement. Undo and dashboard dismiss both use this table.

DROP POLICY IF EXISTS user_dismissed_job_cards_own_select
    ON public.user_dismissed_job_cards;
DROP POLICY IF EXISTS user_dismissed_job_cards_own_insert
    ON public.user_dismissed_job_cards;
DROP POLICY IF EXISTS user_dismissed_job_cards_own_update
    ON public.user_dismissed_job_cards;
DROP POLICY IF EXISTS user_dismissed_job_cards_own_delete
    ON public.user_dismissed_job_cards;

CREATE POLICY user_dismissed_job_cards_own_select
    ON public.user_dismissed_job_cards
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_dismissed_job_cards_own_insert
    ON public.user_dismissed_job_cards
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_dismissed_job_cards_own_update
    ON public.user_dismissed_job_cards
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_dismissed_job_cards_own_delete
    ON public.user_dismissed_job_cards
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.user_dismissed_job_cards FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.user_dismissed_job_cards TO authenticated;

NOTIFY pgrst, 'reload schema';
