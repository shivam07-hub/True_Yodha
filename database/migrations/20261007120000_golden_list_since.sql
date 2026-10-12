-- The golden list (Shivam, 2026-09-30, grill D8): the people he names as
-- job-hunting right now. One column on the profile, no new table — empty means
-- not on the list, a date means on it since then. Only the #59 digest reads it.
-- digest_unsubscribed_at arrives with #59 S3, beside the code that writes it.

alter table public.user_profiles
  add column if not exists golden_list_since timestamptz;

create index if not exists idx_user_profiles_golden_list
  on public.user_profiles (golden_list_since)
  where golden_list_since is not null;

notify pgrst, 'reload schema';
