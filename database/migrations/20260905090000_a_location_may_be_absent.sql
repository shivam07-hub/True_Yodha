-- `jobs.location` may be absent, and absence is not the word "unknown".
--
-- The column was NOT NULL, so `job_importer` could not record "we did not find
-- a location" and minted a sentinel instead:
--
--   "location": (body.location or "").strip() or "unknown"
--
-- That string is then a value like any other. It reached the card and printed
-- as the job's location on 6 of the 20 extension imports in prod — a user
-- looking at a Google role was told the job is in "unknown". `is_valid_location`
-- did not catch it either, because a 7-character non-URL string is valid.
--
-- An empty slot is three states — stated, cleared, absent — and a NOT NULL
-- column can only say the first two. Every reader already declares
-- `location: str | None` (JobMatchResponse, ApplicationResponse, JobFeedItem
-- and six more), so nothing has to change to tolerate the null.
--
-- WIDENING, so it ships BEFORE the code that writes NULL — the reverse of
-- expand-contract's usual order, because here the old code stays valid.
-- REVERSIBLE: re-adding NOT NULL needs the sentinel back, which is the bug.

ALTER TABLE public.jobs ALTER COLUMN location DROP NOT NULL;

-- The 6 rows already carrying the sentinel. Nothing is lost: "unknown" was
-- never a location, and NULL is what the importer meant to record.
UPDATE public.jobs SET location = NULL WHERE lower(trim(location)) = 'unknown';

NOTIFY pgrst, 'reload schema';
