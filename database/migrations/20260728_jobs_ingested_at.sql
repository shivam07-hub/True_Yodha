-- 20260728_jobs_ingested_at.sql
-- New-inventory truth: WHEN a row actually landed in our DB.
--
-- Why: `first_seen` is a YYYYMMDD int stamped from the scraper's run-date FOLDER,
-- not the import moment. On 2026-07-28 a 30,043-row batch was imported carrying
-- first_seen = 20260727, and every "new jobs since you last matched" check is a
-- strict `first_seen > <user's last-match date as YYYYMMDD>`. A batch whose marker
-- is already in the past is therefore invisible to that comparison FOREVER — not
-- late, permanently unseen — for any user whose last match is on/after the marker
-- day. Date-granularity also loses every intra-day ordering.
--
-- `ingested_at` is a real timestamp owned by the DB (DEFAULT now()), so no importer
-- can stamp it wrong. Every new-inventory read compares timestamps from here on.
--
-- Additive + reversible: new nullable column → backfill → default + NOT NULL.

alter table public.jobs add column if not exists ingested_at timestamptz;

-- Backfill 1 — everything datable from the scrape marker (00:00 UTC of that day).
update public.jobs
   set ingested_at = to_timestamp(first_seen::text, 'YYYYMMDD')
 where ingested_at is null
   and first_seen is not null;

-- Backfill 2 — the 2026-07-27-marked batch actually landed on 2026-07-28.
-- Evidence: the importer's own artifacts for run_date 2026_07_27 were written
-- 2026-07-28 09:59–10:32 IST (04:29–05:02 UTC); no rows carry first_seen 20260728.
-- Stamped at the earliest observed artifact time — the honest floor, never later
-- than the truth, so a user who matched before the import still sees them as new.
update public.jobs
   set ingested_at = timestamptz '2026-07-28 04:29:00+00'
 where first_seen = 20260727;

-- Backfill 3 — no marker at all: unknowable, so date them to the epoch rather than
-- to now(). An undatable row must never masquerade as fresh inventory for everyone.
update public.jobs
   set ingested_at = timestamptz '1970-01-01 00:00:00+00'
 where ingested_at is null;

alter table public.jobs alter column ingested_at set default now();
alter table public.jobs alter column ingested_at set not null;

-- The new-inventory read is always "live rows landed after T".
create index if not exists idx_jobs_ingested_at_active
    on public.jobs (ingested_at desc)
    where is_active;
