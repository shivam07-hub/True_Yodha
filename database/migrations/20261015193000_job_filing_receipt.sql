-- A company-page confirmation, and the reasons a filing stopped.
-- The Yes table already exists. These columns are the receipt and the hold.
-- The browser role still cannot write the row. `applied` is a separate write
-- the API makes only after the receipt host matches the job.

BEGIN;

ALTER TABLE public.job_filing_authorizations
    ADD COLUMN IF NOT EXISTS receipt_url text,
    ADD COLUMN IF NOT EXISTS receipt_text text,
    ADD COLUMN IF NOT EXISTS received_at timestamptz,
    ADD COLUMN IF NOT EXISTS hold_reason text;

ALTER TABLE public.job_filing_authorizations
    DROP CONSTRAINT IF EXISTS job_filing_receipt_text_len;
ALTER TABLE public.job_filing_authorizations
    ADD CONSTRAINT job_filing_receipt_text_len
    CHECK (receipt_text IS NULL OR char_length(receipt_text) >= 12);

ALTER TABLE public.job_filing_authorizations
    DROP CONSTRAINT IF EXISTS job_filing_receipt_url_http;
ALTER TABLE public.job_filing_authorizations
    ADD CONSTRAINT job_filing_receipt_url_http
    CHECK (receipt_url IS NULL OR receipt_url ~* '^https?://');

ALTER TABLE public.job_filing_authorizations
    DROP CONSTRAINT IF EXISTS job_filing_receipt_pair;
ALTER TABLE public.job_filing_authorizations
    ADD CONSTRAINT job_filing_receipt_pair
    CHECK (
        (received_at IS NULL AND receipt_url IS NULL AND receipt_text IS NULL)
        OR (received_at IS NOT NULL AND receipt_url IS NOT NULL AND receipt_text IS NOT NULL)
    );

ALTER TABLE public.job_filing_authorizations
    DROP CONSTRAINT IF EXISTS job_filing_hold_reason;
ALTER TABLE public.job_filing_authorizations
    ADD CONSTRAINT job_filing_hold_reason
    CHECK (hold_reason IS NULL OR hold_reason IN ('login', 'captcha', 'unanswered'));

-- The ₹599 process: who the work is for, which pages, and consent.
-- Payment sets paid_at. The browser role can read its own row and cannot write it.
CREATE TABLE IF NOT EXISTS public.filing_intakes (
    user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    target_role text NOT NULL,
    cities text NOT NULL,
    portals text NOT NULL,
    consented_at timestamptz NOT NULL,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.filing_intakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS filing_intakes_select_own ON public.filing_intakes;
CREATE POLICY filing_intakes_select_own
    ON public.filing_intakes
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.filing_intakes FROM authenticated, anon;
GRANT SELECT ON public.filing_intakes TO authenticated;

COMMENT ON COLUMN public.job_filing_authorizations.received_at IS
    'When a company-page confirmation was stored. The application status is a separate write.';
COMMENT ON COLUMN public.job_filing_authorizations.hold_reason IS
    'login, captcha, or unanswered. A hold does not mark the job applied.';

NOTIFY pgrst, 'reload schema';

COMMIT;
