-- The sheet PDF for one approved filing, and a hold when the form asks
-- for that file before Myro has it. The bytes are the previewed sheet,
-- posted after a download. The browser role still cannot write the row.

BEGIN;

ALTER TABLE public.job_filing_authorizations
    ADD COLUMN IF NOT EXISTS resume_pdf text,
    ADD COLUMN IF NOT EXISTS resume_filename text;

ALTER TABLE public.job_filing_authorizations
    DROP CONSTRAINT IF EXISTS job_filing_resume_pdf_len;
ALTER TABLE public.job_filing_authorizations
    ADD CONSTRAINT job_filing_resume_pdf_len
    CHECK (resume_pdf IS NULL OR char_length(resume_pdf) <= 2000000);

ALTER TABLE public.job_filing_authorizations
    DROP CONSTRAINT IF EXISTS job_filing_hold_reason;
ALTER TABLE public.job_filing_authorizations
    ADD CONSTRAINT job_filing_hold_reason
    CHECK (hold_reason IS NULL OR hold_reason IN ('login', 'captcha', 'unanswered', 'resume'));

COMMENT ON COLUMN public.job_filing_authorizations.resume_pdf IS
    'Base64 of the sheet PDF for this job. Absent until a download stores it.';
COMMENT ON COLUMN public.job_filing_authorizations.hold_reason IS
    'login, captcha, unanswered, or resume. A hold does not mark the job applied.';

NOTIFY pgrst, 'reload schema';

COMMIT;
