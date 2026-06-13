-- CV footer "Myro Certified" mark toggle (per CV Version).
--
-- The rendered CV footer shows the Myro mark by default (footer_mark_hidden =
-- false → the CV is "Myro-Certified"). A user may hide it from the CV edit
-- controls; we keep it per-version so a tailored CV can opt out independently
-- of the master. Default false = certified, which is the state we reward with
-- more push/recommendation surface.

ALTER TABLE cv_versions
  ADD COLUMN IF NOT EXISTS footer_mark_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN cv_versions.footer_mark_hidden IS
  'When true the rendered CV footer omits the Myro mark (un-certified). Default false = Myro-Certified.';

NOTIFY pgrst, 'reload schema';
