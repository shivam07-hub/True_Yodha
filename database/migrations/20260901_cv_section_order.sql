-- Company CV Thread section order (playground projection).
--
-- Same grain as hidden_items: per CV Version, not the living master.
-- Identity (name/contact) stays pinned in the editor; this list is every
-- other block. NULL = default order (summary → experience → … → certs).

ALTER TABLE cv_versions
  ADD COLUMN IF NOT EXISTS section_order JSONB;

COMMENT ON COLUMN cv_versions.section_order IS
  'Playground projection: ordered section keys (summary, experience, projects, skills_line, education, certs). NULL = default outline.';

NOTIFY pgrst, 'reload schema';
