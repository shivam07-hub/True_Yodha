-- Multi-role targeting (User Memory Phase 0).
--
-- Users target 3-5 human role titles (rendered as chips). Those titles are the
-- source-of-record; `target_roles` (taxonomy clusters, ILIKE match keys used by
-- the matcher + scoring/aspirations) stays the DERIVED projection = union of
-- clusters across all titles. `target_role_title` (singular) stays as the
-- PRIMARY = titles[0], for back-compat + the score label.
--
-- Manual-apply (Supabase migrations are not auto-applied), then:
--   NOTIFY pgrst, 'reload schema';

alter table user_profiles
  add column if not exists target_role_titles text[] not null default '{}';

-- Backfill: wrap the existing singular title into the list for current users.
update user_profiles
   set target_role_titles = array[target_role_title]
 where target_role_title is not null
   and btrim(target_role_title) <> ''
   and (target_role_titles is null or cardinality(target_role_titles) = 0);
