-- Deal-Breaker (2026-09-28): the brain's pay band and the won't-take lines a
-- posting breaks, stored on the verdict that judged them.
--
-- A pay floor never hides a job — Indian listings rarely print pay — so the
-- card shows an estimated band and says when it sits under the floor.
-- `breaks` is the person's own words, so a stored verdict still says which line
-- it honoured after they edit the list. A non-empty `breaks` row is a Skip.
--
-- Additive. Rows rated before prompt v4 hold NULL / '[]' and are re-rated on
-- their user's next Search (forward pass; nothing is backfilled).
--
-- Rollback:
--   alter table public.user_job_matches
--     drop column if exists ctc_low_lpa, drop column if exists ctc_high_lpa,
--     drop column if exists ctc_basis, drop column if exists breaks;

alter table public.user_job_matches
  add column if not exists ctc_low_lpa numeric,
  add column if not exists ctc_high_lpa numeric,
  add column if not exists ctc_basis text,
  add column if not exists breaks jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_job_matches_ctc_basis_check'
  ) then
    alter table public.user_job_matches
      add constraint user_job_matches_ctc_basis_check
      check (ctc_basis is null or ctc_basis in ('stated', 'estimated'));
  end if;
end $$;

comment on column public.user_job_matches.ctc_low_lpa is
  'Low end of the pay band for this role, INR lakhs per annum. Stated or estimated per ctc_basis.';
comment on column public.user_job_matches.ctc_high_lpa is
  'High end of the pay band, INR lakhs per annum. Compared with the pay floor: under it reads "below your floor".';
comment on column public.user_job_matches.ctc_basis is
  'stated = the posting printed pay; estimated = the brain placed it from company and competitor bands.';
comment on column public.user_job_matches.breaks is
  'The won''t-take lines (person''s own words) this posting breaks. Non-empty means the verdict is Skip.';
