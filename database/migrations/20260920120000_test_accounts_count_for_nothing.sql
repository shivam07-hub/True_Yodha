-- Myro's own accounts, and why they must count for nothing.
--
-- The Match Quality gate needs personas that walk the REAL journey — sign in,
-- upload a CV, choose a direction, open Jobs — because the thing under test is
-- what the frontend renders, and the corpus it renders from is this database.
-- Dev and prod share one database, so those personas land in the real tables
-- next to the 876 real people.
--
-- Left unmarked they would quietly move every number we steer by: the seeker
-- count on the landing page, the spine (821 → 398 → 387 → 261 → 70 → 14), loop
-- reach, the band percentiles behind "top X% for mid", and the CV-upload phase
-- telemetry that tells us whether uploads are healthy. A persona that uploads a
-- CV every night would read as a returning user with perfect funnel behaviour.
--
-- One column, default false, so every existing row and every real signup is
-- already correct. Marking an account is a deliberate act.
--
-- The column is only half of it: each population counter has to ASK. Today that
-- is `_count_seekers` (public landing), `scripts/loop_reach.py` (the spine),
-- `ScoresRepository.get_all_band_scores` (percentile peers) and
-- `routers/telemetry.py` (upload funnel). `app/services/test_accounts.py` is the
-- one place that answers "whose numbers are ours", and
-- `tests/test_test_accounts_excluded.py` fails if a counter stops asking.
--
-- Additive and reversible: drop the index, drop the column.

alter table public.user_profiles
  add column if not exists is_test_account boolean not null default false;

comment on column public.user_profiles.is_test_account is
  'Myro''s own accounts (the Match Quality personas, QA logins). Real to the product, invisible to every population number: seeker counts, loop reach, score percentiles, upload telemetry. Dev and prod share one database, so a persona that walks the real journey lands in the real tables — this column is what keeps it out of the numbers we make decisions on.';

-- Partial: the readers ask "which ids are ours", never "is this one ours" in
-- bulk. Index-only over a handful of rows instead of a scan of every profile.
create index if not exists idx_user_profiles_test_accounts
  on public.user_profiles (id) where is_test_account;

notify pgrst, 'reload schema';
