-- Brain-dump provenance — the "one place, and I can see where each thought came
-- from" half of the unified self-reservoir (backlog: unified Job-Ops brain).
--
-- The notebook (cv_dump_entries) is becoming the single place every surface where
-- the user writes about himself dumps into — manual brain-dumps AND, starting now,
-- his "Not it? Tell Myro" answers. `source` records which surface authored each
-- entry so /notebook can label provenance and the user can read back an honest
-- picture of what he told Myro, everywhere. The distiller still reads `text` only,
-- so this is display-only metadata — no behaviour change to distillation.
--
-- Additive + backfilled ('manual' = the pre-existing hand-written entries).
-- ⚠️ Apply BEFORE the backend deploy that writes source (else /cv/dump inserts
-- reference an unknown column). Manual-apply then NOTIFY pgrst.

ALTER TABLE public.cv_dump_entries
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.cv_dump_entries.source IS
    'Which surface authored this entry: manual | job_intent (future: cv_pointer, …). Display-only provenance; distillation reads text only.';

NOTIFY pgrst, 'reload schema';
