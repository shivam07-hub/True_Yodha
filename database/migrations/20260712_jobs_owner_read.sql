-- Owner-read for extension-imported jobs.
--
-- Extension-imported jobs are the user's OWN discovery. The importer stores them
-- with listing_confidence='uncertain' ON PURPOSE so they stay OUT of the global
-- feed/market/analytics (every feed query filters listing_confidence='active').
--
-- But the ONLY select policy on `jobs` was "jobs public read":
--     (listing_confidence = 'active' AND is_active IS TRUE)
-- so the user-token client could not read their OWN tracked extension job. Every
-- per-job read that goes through the user-token client — GET /jobs/applications/
-- {id}/path (_get_job) and GET /jobs/{id}/skill-gap (get_job_skills meta) — 404'd
-- on that job. In CV Playground that surfaced as "Untitled role", 0 extracted
-- skills, and a phantom 0/100 Ready score for any extension-tracked job.
--
-- Fix: a job's creator can always read it, regardless of listing_confidence.
-- This is strictly the caller's own rows (created_by_user_id = auth.uid()), so no
-- cross-user exposure; anon (auth.uid() IS NULL) still only sees active listings;
-- and it does NOT leak extension jobs into the global feed (those queries keep
-- their explicit listing_confidence='active' SQL filter).
--
-- Apply on Supabase, then: NOTIFY pgrst, 'reload schema';
-- (Shared DB → one apply fixes both dev and prod; no backend deploy required for
-- the title/skills unblock — the code already reads via the user-token client.)

BEGIN;

ALTER POLICY "jobs public read" ON public.jobs
  USING (
    (listing_confidence = 'active' AND is_active IS TRUE)
    OR created_by_user_id = auth.uid()
  );

COMMIT;

-- NOTIFY pgrst, 'reload schema';
