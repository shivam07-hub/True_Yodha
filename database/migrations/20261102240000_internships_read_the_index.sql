-- /jobs/internships was a cold 8.1s and a warm seniority-only read was 7.6s.
-- The list OR'd a title ilike into the live filter, so the planner could not
-- walk an index and stop at 60. The page is the 8s cutoff: "try again".
--
-- Drop the ilike from the query. These three tags are the list, and this
-- index is exactly that predicate, ordered by first_seen, so the 60 rows are
-- the end of the index.

create index if not exists idx_jobs_live_intern_first_seen
  on public.jobs (first_seen desc)
  where is_active is true
    and listing_confidence = 'active'
    and (
      employment_kind = 'internship'
      or seniority_level = 'intern'
      or listing_venue = 'myro'
    );
