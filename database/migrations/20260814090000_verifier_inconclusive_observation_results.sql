-- Two new observation results, both inconclusive by construction.
--
-- `unroutable`  — the apply URL could not have addressed the listing at all, so
--                 whatever the ATS returned describes our data defect, not the
--                 job. Workday routes by tenant site
--                 (<tenant>.<pod>.myworkdayjobs.com/<site>/job/…); a URL missing
--                 <site> gets a blanket 404 whether the role is open or not.
-- `source_failure` — a closure the sweep withheld because one apply-host closed
--                 nearly every conclusive verdict in a single run. A listing
--                 dies one at a time; a source dies all at once.
--
-- Both are inert in the transition table: the attempt is stamped, the row is
-- kept for forensics, stored confidence is untouched. Additive and reversible.

ALTER TABLE public.job_listing_observations
    DROP CONSTRAINT IF EXISTS job_listing_observations_result_check;

ALTER TABLE public.job_listing_observations
    ADD CONSTRAINT job_listing_observations_result_check
    CHECK (result = ANY (ARRAY[
        'seen_live',
        'apply_live',
        'source_missing',
        'closed',
        'redirected',
        'wrong_role',
        'blocked',
        'timeout',
        'error',
        'unroutable',
        'source_failure'
    ]));
