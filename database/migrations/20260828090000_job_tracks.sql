-- Job Tracks — a second job search, with its own role words, CV and applications.
--
-- "15-20 consulting and 15-20 marketing." Today `target_role_titles` (arity 6)
-- flattens both intents into one ranked list and nothing groups the result.
--
-- THE INVARIANT THIS TABLE EXISTS TO PROTECT: **track 1 is the profile, not a
-- row here.** `user_job_matches.track_id IS NULL` means track 1, whose role
-- words live where they always have (`user_profiles.target_role_titles`). 88 of
-- 106 users with a target set exactly one role title; they must never acquire a
-- row, a migration, or a concept. A `job_tracks` row exists only for a SECOND
-- search a user deliberately opened. Backfilling track 1 would create a second
-- source of truth for the common case and give every existing user a structure
-- they never asked for.
--
-- Additive and reversible: one new table, one nullable column.

begin;

create table if not exists public.job_tracks (
    id            bigint generated always as identity primary key,
    user_id       uuid not null references auth.users (id) on delete cascade,
    -- The user's own words for this search ("marketing"), shown as the group
    -- header. Never a taxonomy key: `role_family` fragments a coherent human
    -- category across dozens of buckets — 40 hand-verified matches for one
    -- candidate carried 31 distinct families, and a PMM role at a crypto
    -- exchange is filed "Cryptocurrency".
    label         text not null,
    -- This track's role words. Same shape and same cap as
    -- `user_profiles.target_role_titles`, because it is the same axis.
    role_titles   text[] not null default '{}'::text[],
    -- Render order. Track 1 is the profile and has no row, so a stored track
    -- starts at 2.
    position      smallint not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    archived_at   timestamptz,
    constraint job_tracks_label_not_blank check (btrim(label) <> ''),
    constraint job_tracks_position_after_profile check (position >= 2)
);

-- One row per user per position, ignoring archived tracks so a user can reopen
-- a slot they closed.
create unique index if not exists job_tracks_user_position_live_idx
    on public.job_tracks (user_id, position)
    where archived_at is null;

create index if not exists job_tracks_user_idx
    on public.job_tracks (user_id)
    where archived_at is null;

-- Which search produced this match. NULL = track 1 = the profile.
alter table public.user_job_matches
    add column if not exists track_id bigint
        references public.job_tracks (id) on delete set null;

-- Partial: the overwhelming majority of rows are track 1 and carry NULL, and
-- the only question anyone asks of this column is "which rows belong to track N".
create index if not exists user_job_matches_track_idx
    on public.user_job_matches (user_id, track_id)
    where track_id is not null;

alter table public.job_tracks enable row level security;

drop policy if exists "own job tracks read" on public.job_tracks;
create policy "own job tracks read"
    on public.job_tracks for select
    using (auth.uid() = user_id);

drop policy if exists "own job tracks insert" on public.job_tracks;
create policy "own job tracks insert"
    on public.job_tracks for insert
    with check (auth.uid() = user_id);

drop policy if exists "own job tracks update" on public.job_tracks;
create policy "own job tracks update"
    on public.job_tracks for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

revoke all on public.job_tracks from anon, authenticated;
grant select, insert, update on public.job_tracks to authenticated;

commit;
