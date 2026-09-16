-- BACKLOG #13 L3 — the standing completion queue must be finishable.
--
-- A bullet's missing number is a fact only the user holds, and ADR-0016 forbids
-- inventing it. So "there is no number for this one" has to be a real answer,
-- or the queue becomes a counter that never reaches zero. This is that answer.
-- Nullable and reversible: clearing it puts the question back.
--
-- APPLIED to the shared Supabase project 2026-09-14 + `NOTIFY pgrst`.
alter table public.career_stories
  add column if not exists completion_declined_at timestamptz;

comment on column public.career_stories.completion_declined_at is
  'When the user set this bullet''s completion question aside ("no number to give"). NULL = still asked. Cleared by Ask me again.';
