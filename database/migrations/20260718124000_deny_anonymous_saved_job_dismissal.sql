-- Anonymous sign-ins also receive the authenticated Postgres role. Collections
-- history belongs only to a permanent account, so require the JWT guard too.

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
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT (auth.jwt() ->> 'is_anonymous')::boolean) IS FALSE
    );

CREATE POLICY user_dismissed_job_cards_own_insert
    ON public.user_dismissed_job_cards
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND (SELECT (auth.jwt() ->> 'is_anonymous')::boolean) IS FALSE
    );

CREATE POLICY user_dismissed_job_cards_own_update
    ON public.user_dismissed_job_cards
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT (auth.jwt() ->> 'is_anonymous')::boolean) IS FALSE
    )
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND (SELECT (auth.jwt() ->> 'is_anonymous')::boolean) IS FALSE
    );

CREATE POLICY user_dismissed_job_cards_own_delete
    ON public.user_dismissed_job_cards
    FOR DELETE
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT (auth.jwt() ->> 'is_anonymous')::boolean) IS FALSE
    );

NOTIFY pgrst, 'reload schema';
