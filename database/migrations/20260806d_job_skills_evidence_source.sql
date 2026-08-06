-- Where a job's skill came from. Without this a deterministic Stage A floor is
-- byte-identical to a judgment-model result, which means we cannot tell Stage B
-- what to re-do, cannot show a user that a match is provisional, and cannot
-- ever measure Stage A's precision against the model that supersedes it.
--
--   enrichment      the scraper's LM Studio pass (apply_job_enrichment, csv_importer)
--   stage_a         deterministic taxonomy extraction — a floor, awaiting judgment
--   user_confirmed  a contributor ticked these in the extension popup
--
-- DEFAULT is 'enrichment' because that is honest for every writer that predates
-- this column; Stage A names itself explicitly.

ALTER TABLE public.job_skills
    ADD COLUMN IF NOT EXISTS evidence_source TEXT NOT NULL DEFAULT 'enrichment';

ALTER TABLE public.job_skills
    DROP CONSTRAINT IF EXISTS job_skills_evidence_source_check;
ALTER TABLE public.job_skills
    ADD CONSTRAINT job_skills_evidence_source_check
    CHECK (evidence_source IN ('enrichment', 'stage_a', 'user_confirmed'));

-- Stage B's work queue: "re-judge everything still standing on a floor".
CREATE INDEX IF NOT EXISTS idx_job_skills_evidence_source
    ON public.job_skills (evidence_source)
    WHERE evidence_source = 'stage_a';

-- Label what already exists. The Stage A backfill run of 2026-08-06 wrote a
-- contiguous block at the top of the id sequence (434 jobs, ids >= 944283);
-- the rows immediately below it belong to extension imports. Verified by
-- ranking jobs on min(job_skills.id) — the break at rank 434/435 is clean.
UPDATE public.job_skills SET evidence_source = 'stage_a' WHERE id >= 944283;

UPDATE public.job_skills AS skill
SET evidence_source = 'user_confirmed'
FROM public.jobs AS job
WHERE job.job_id = skill.job_id
  AND job.ingestion_source = 'extension'
  AND skill.evidence_source = 'enrichment';
