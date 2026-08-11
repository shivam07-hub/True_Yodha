-- Cover the canonical-company foreign key and keep the own-row RLS predicate
-- initplanned instead of evaluating JWT helpers once per candidate row.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_followed_companies_company_id
    ON public.followed_companies (company_id);

DROP POLICY IF EXISTS "Users read their own follows" ON public.followed_companies;
CREATE POLICY "Users read their own follows"
    ON public.followed_companies
    FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND COALESCE(((SELECT auth.jwt()) ->> 'is_anonymous')::BOOLEAN, FALSE) = FALSE
    );

NOTIFY pgrst, 'reload schema';
COMMIT;
