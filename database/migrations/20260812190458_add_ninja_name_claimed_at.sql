-- Applied 2026-08-13 via Supabase (version 20260812190458). Mirrored here so
-- every other machine and agent can see it.
--
-- A ninja name is auto-provisioned at signup, so its presence proves nothing
-- about whether the user ever chose it. Without this, `suggest` hands back the
-- random slug it generated itself ("cosmic-otter-4b1x") and the naming moment
-- asks the user to confirm junk — which is why 476 of 481 names are untouched.
alter table public.user_profiles
  add column if not exists ninja_name_claimed_at timestamptz;

comment on column public.user_profiles.ninja_name_claimed_at is
  'Set when the user actively picks their ninja name. NULL = still the slug we auto-generated at signup, so we may suggest a better default and offer the naming step once.';

-- Backfill the users who demonstrably chose: anything not matching the
-- auto-generated {adjective}-{noun}-{4char} shape was typed by a human.
-- Conservative on purpose — a user who happens to have picked a name of that
-- shape simply gets offered the step once and can dismiss it.
update public.user_profiles
   set ninja_name_claimed_at = now()
 where ninja_name is not null
   and ninja_name !~ '^[a-z]+-[a-z]+-[a-z0-9]{4}$'
   and ninja_name_claimed_at is null;
