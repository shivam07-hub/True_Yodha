-- PostgREST serializes `.eq("is_active", True)` as `is_active = true`.
-- PostgreSQL does not use a partial index whose predicate is written with
-- `is_active is true` for that generated expression, even though their result
-- sets are equivalent. Recreate it with the exact emitted predicate.
drop index if exists public.idx_jobs_feed_active_first_seen;

create index idx_jobs_feed_active_first_seen
    on public.jobs (first_seen desc, job_id desc)
    where is_active = true and listing_confidence = 'active';

comment on index public.idx_jobs_feed_active_first_seen is
    'J0 market feed: predicate matches PostgREST is_active=true exactly';
