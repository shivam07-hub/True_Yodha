-- A paid internship posted on Myro waits for a person at Myro to glance at it
-- before seekers can see it, so a fake internship does not reach a seeker.
--
-- A held post is saved with is_active false, so every live read (live_only,
-- idx_jobs_live_intern_first_seen) already leaves it out. hosted_review is the
-- state the poster and the reviewer read: pending -> cleared | refused.
-- NULL on every row the scraper writes; only listing_venue = 'myro' rows set it.
--
-- Additive and reversible:
--   drop index if exists public.idx_jobs_hosted_review_pending;
--   alter table public.jobs drop column if exists hosted_reviewed_at;
--   alter table public.jobs drop column if exists hosted_review;

alter table public.jobs
  add column if not exists hosted_review text
    check (hosted_review in ('pending', 'cleared', 'refused')),
  add column if not exists hosted_reviewed_at timestamptz;

-- The reviewer's queue reads only pending posts out of the whole corpus.
create index if not exists idx_jobs_hosted_review_pending
  on public.jobs (first_seen desc)
  where hosted_review = 'pending';

notify pgrst, 'reload schema';
