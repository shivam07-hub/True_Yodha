-- CV analysis status contains user-owned processing metadata. Keep the read
-- surface owner-scoped, reject anonymous-auth identities, and evaluate JWT
-- helpers once per statement rather than once per row.

DROP POLICY IF EXISTS cv_upload_jobs_select_own ON public.cv_upload_jobs;

CREATE POLICY cv_upload_jobs_select_own
    ON public.cv_upload_jobs
    FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::boolean, FALSE) = FALSE
    );
