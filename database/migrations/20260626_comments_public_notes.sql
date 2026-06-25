-- 20260626_comments_public_notes.sql
-- Repurpose the private `comments` table into a PUBLIC community-notes surface.
-- Safe because `comments` is empty at migration time (verified: select count(*) = 0).
-- Public read (status='visible'); writes stay own-only. Author shown via ninja_name
-- (joined app-side from user_profiles — never expose user_id publicly).
--
-- Design: docs/PUBLIC_JOB_NOTES_FEATURE.md
-- Mirrors the job_reports moderation pattern: community flag -> auto-hide at threshold.

begin;

-- ── New columns ──────────────────────────────────────────────────────────────
alter table public.comments
  add column if not exists status text not null default 'visible';
alter table public.comments
  add column if not exists report_count int not null default 0;

alter table public.comments
  drop constraint if exists comments_status_chk;
alter table public.comments
  add constraint comments_status_chk check (status in ('visible', 'hidden', 'removed'));

-- Public-feed read path: newest-first per entity, visible only.
create index if not exists comments_entity_feed_idx
  on public.comments (entity_type, entity_id, status, created_at desc);

-- ── RLS: swap own-only SELECT for public SELECT ─────────────────────────────
-- Reads become public (anon included), gated to visible rows.
-- INSERT/UPDATE/DELETE remain own-only (policies comments_own_insert/update/delete
-- already enforce auth.uid() = user_id and are left intact).
drop policy if exists comments_own_select on public.comments;
drop policy if exists comments_public_select on public.comments;
create policy comments_public_select on public.comments
  for select using (status = 'visible');

-- ── Flag dedup table: one flag per user per comment ─────────────────────────
create table if not exists public.comment_flags (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (comment_id, user_id)
);

alter table public.comment_flags enable row level security;
-- Users may record their own flag; reads happen server-side via the service role.
drop policy if exists comment_flags_own_insert on public.comment_flags;
create policy comment_flags_own_insert on public.comment_flags
  for insert with check (auth.uid() = user_id);

-- ── Auto-hide trigger: report_count crosses threshold -> hide ───────────────
create or replace function public.comments_autohide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.report_count >= 5 and coalesce(old.report_count, 0) < 5 and new.status = 'visible' then
    new.status := 'hidden';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_autohide_trg on public.comments;
create trigger comments_autohide_trg
  before update of report_count on public.comments
  for each row execute function public.comments_autohide();

commit;
