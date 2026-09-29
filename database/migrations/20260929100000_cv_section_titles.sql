-- A person may rename their CV's section headings ("Projects" -> "Projects and
-- Agentic Pursuits"). Opt-in: an absent key reads as the default heading.
--
-- On the profile, not the CV Version: a heading is how this person names their
-- own work, the same on the master and on every CV tailored from it, the way
-- `accent_pref` is how they like the app to look. `cv_structured` keeps its
-- seven-key contract untouched.
--
-- Written only through PUT /users/me/profile, which normalises it
-- (`cv_section_order.normalize_section_titles`): known section keys, trimmed,
-- at most 40 characters, a title equal to the default is dropped.
--
-- Additive and reversible:
--   alter table public.user_profiles drop column if exists cv_section_titles;

alter table public.user_profiles
  add column if not exists cv_section_titles jsonb;

comment on column public.user_profiles.cv_section_titles is
  'Renamed CV section headings, keyed by section (summary, experience, projects, skills_line, education, certs). Absent key = default heading. Read by every CV render: sheet, PDF, DOCX.';

notify pgrst, 'reload schema';
