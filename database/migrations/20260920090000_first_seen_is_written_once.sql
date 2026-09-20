-- `first_seen` answers "when did this listing appear" and nothing else.
--
-- It stopped answering it. The scraper's importer sets `first_seen = batch_date`
-- on EVERY row it sends (myro-job-scraper `scraper/csv_importer.py`), and its
-- upsert is PostgREST merge-duplicates, which updates every column in the
-- payload. The comment above that line says the value is "ignored on conflict".
-- It never was. So each crawl restamped the whole corpus with the crawl's own
-- date, and the column came to mean "when did we last crawl this".
--
-- Measured 2026-09-19: 34,022 of 38,824 active listings carried `20260909`, the
-- last full crawl. 13,001 of them had been ingested between June and August.
--
-- That is not a cosmetic drift. `/market`'s personal feed picks its candidate
-- pool with `order(first_seen desc).limit(500)`, so with 88% of the corpus tied
-- on one value the pool was an arbitrary 500 rows out of 34,022 — the same 500
-- for every user on the same filters. One user's whole feed measured 34 jobs.
--
-- A comment cannot hold a contract across two repositories. This can:
-- once a listing has a `first_seen`, an UPDATE may not change it. The scraper's
-- payload becomes harmless whether or not the scraper is fixed, and so does the
-- next writer nobody remembers to check.
--
-- Deliberately silent (coerce, don't raise): the crawler sends this column on
-- every re-observation, so raising would fail live crawls to punish a payload
-- we are about to fix anyway. INSERT is untouched — discovery still sets it.
-- Reversible: drop the trigger and the function.
--
-- NOT a repair of the 34,022 corrupted values. Forward only (Shivam,
-- 2026-09-20): nothing is rewritten, and the ranking work stops depending on
-- this column instead.

create or replace function private.preserve_job_first_seen()
returns trigger
language plpgsql
as $$
begin
  -- Discovery is recorded once. A re-observation moves `last_seen`, never this.
  if old.first_seen is not null then
    new.first_seen := old.first_seen;
  end if;
  return new;
end;
$$;

-- `UPDATE OF first_seen` so the trigger costs nothing on the updates that do
-- not carry the column (the verifier's lifecycle writes, enrichment, skills).
drop trigger if exists preserve_job_first_seen on public.jobs;

create trigger preserve_job_first_seen
  before update of first_seen on public.jobs
  for each row
  execute function private.preserve_job_first_seen();

notify pgrst, 'reload schema';
