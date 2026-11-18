-- Myro Supported is any opening whose application lives on Myro.
-- Paid internships stay paid. A full-time job posted on Myro no longer has to
-- carry a stipend, which the old check required of every hosted row.
--
-- Reversible: restore jobs_hosted_paid_internship_check from
-- 20261015153000_hosted_listings.sql. That restore fails if a full-time
-- hosted row exists; delete those rows first.

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_hosted_paid_internship_check;

ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_hosted_paid_internship_check
    CHECK (
        listing_venue <> 'myro'
        OR employment_kind = 'full_time'
        OR (
            employment_kind = 'internship'
            AND stipend_low_inr IS NOT NULL
            AND stipend_low_inr > 0
        )
    );

NOTIFY pgrst, 'reload schema';
