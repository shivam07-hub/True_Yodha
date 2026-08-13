-- #16 production read capacity: the personal feed asks for the newest bounded
-- candidate pool among listings that are both live and recommendable. Separate
-- indexes on confidence and activity forced Postgres to visit ~23k heap rows and
-- top-N sort them before LIMIT 500 (8.55s measured with a warm buffer cache).
-- This partial ordered index lets the executor stop after the first 500 matches.
create index if not exists idx_jobs_feed_active_first_seen
    on public.jobs (first_seen desc, job_id desc)
    where is_active is true and listing_confidence = 'active';

comment on index public.idx_jobs_feed_active_first_seen is
    'J0 market feed: newest recommendable listings without scanning and sorting the active corpus';
