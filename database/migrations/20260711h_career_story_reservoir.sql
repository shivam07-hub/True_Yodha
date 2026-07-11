-- Career Story Reservoir — the consolidation spine of the CV knowledge/inflow layer.
--
-- North star (Shivam, 2026-07-11): user gives a DUMP (old CVs, pointer docs,
-- LinkedIn export, free text) → Myro builds a comprehensive career profile:
-- roles → STORIES (STAR narrative + metrics + skills proven) → pointers.
-- A tailored 1-page CV is a per-job PROJECTION of stories; interview prep reads
-- the same stories. Extraction is grounded in the CV playbook (mentor shelf).
--
-- Consolidation, not a bolt-on:
--   * career_roles    — NEW. Stable role containers. Kills the positional
--                       role_anchor fragility flagged in cv_points (reorder-unsafe
--                       "experience:0" anchors).
--   * career_stories  — NEW. The parent narrative. cv_points become phrasings /
--                       projections OF a story (nullable story_id added below).
--   * cv_dump_entries — BROADENED into the one inflow ledger: every capture
--                       surface (notebook, Tell-Myro, file dump, LinkedIn zip)
--                       writes here; the extractor reads it and forward-links
--                       the stories it derived (provenance both ways).
--   * user_memory     — UNTOUCHED (already deep + consumed by matching).
--
-- Inflow policy (Shivam, 2026-07-11): bulk dumps AUTO-ACCEPT into the reservoir,
-- user curates after (supersedes the 2026-06-24 "every inflow user-confirmed"
-- rule for the dump flow). Archive-not-delete still holds.
--
-- Additive + reversible. Own-only RLS (PV1). Manual-apply then NOTIFY pgrst.

BEGIN;

-- ── 1. Stable role containers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.career_roles (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company      text NOT NULL DEFAULT '',
    title        text NOT NULL,
    location     text NOT NULL DEFAULT '',
    -- CV dates are fuzzy ("May 2025 – Present"); keep the human label verbatim
    -- and a best-effort sortable date for ordering.
    date_label   text NOT NULL DEFAULT '',
    started_on   date,
    finished_on  date,
    kind         text NOT NULL DEFAULT 'work'
                   CHECK (kind IN ('work', 'education', 'leadership', 'volunteer', 'other')),
    source       text NOT NULL DEFAULT 'ingest',
    status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_career_roles_user ON public.career_roles (user_id, status);

ALTER TABLE public.career_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own career roles" ON public.career_roles;
CREATE POLICY "own career roles" ON public.career_roles
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_roles TO authenticated;

-- ── 2. The story spine ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.career_stories (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- NULL for role-less stories (accolades, olympiads, certs-as-stories).
    role_id       uuid REFERENCES public.career_roles(id) ON DELETE SET NULL,
    kind          text NOT NULL DEFAULT 'project'
                    CHECK (kind IN ('project', 'achievement', 'accolade', 'education', 'research', 'other')),
    title         text NOT NULL,
    -- {situation, task, action, result} — each a short paragraph. The interview-
    -- prep consumer reads this directly; pointers project from it.
    narrative     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- [{"value": "30%", "what": "revenue uplift"}] — quantified outcomes only,
    -- extracted verbatim (no-fabrication rule, ADR-0016).
    metrics       jsonb NOT NULL DEFAULT '[]'::jsonb,
    skills        text[] NOT NULL DEFAULT '{}',
    audience_tags text[] NOT NULL DEFAULT '{}',
    -- 768-dim, same pinned model as cv_points/user_memory (embeddings.py).
    -- NULLABLE: filled async, never blocks a write. Used for silent dedup
    -- fold-in + per-JD story selection.
    embedding     vector(768),
    source        text NOT NULL DEFAULT 'ingest'
                    CHECK (source IN ('ingest', 'manual', 'distilled', 'forge')),
    -- Provenance: which cv_dump_entries rows this story was extracted from.
    inflow_ids    uuid[] NOT NULL DEFAULT '{}',
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_career_stories_user ON public.career_stories (user_id, status);
CREATE INDEX IF NOT EXISTS idx_career_stories_role ON public.career_stories (role_id);
CREATE INDEX IF NOT EXISTS idx_career_stories_embedding
    ON public.career_stories USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.career_stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own career stories" ON public.career_stories;
CREATE POLICY "own career stories" ON public.career_stories
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_stories TO authenticated;

-- ── 3. cv_points: a point is a phrasing/projection OF a story ────────────────
ALTER TABLE public.cv_points
    ADD COLUMN IF NOT EXISTS story_id uuid REFERENCES public.career_stories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cv_points_story ON public.cv_points (story_id);

COMMENT ON COLUMN public.cv_points.story_id IS
    'Parent career story this phrasing projects from. NULL for legacy points not yet folded into a story.';

-- ── 4. cv_dump_entries: broaden into THE inflow ledger ───────────────────────
-- `source` (20260709) = which surface authored it (manual | job_intent | ...).
-- `kind` = payload shape, so the extractor knows how to read it.
ALTER TABLE public.cv_dump_entries
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'note',
    ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS processed_at timestamptz,
    ADD COLUMN IF NOT EXISTS derived_story_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.cv_dump_entries.kind IS
    'Payload shape for the extractor: note | file | linkedin. text always holds the readable content.';
COMMENT ON COLUMN public.cv_dump_entries.payload IS
    'Shape metadata, e.g. {"filename": "...", "file_type": "pdf", "csv": "Positions"}. Never the file bytes.';
COMMENT ON COLUMN public.cv_dump_entries.derived_story_ids IS
    'Forward provenance: career_stories extracted from this entry. Empty until processed.';

COMMIT;

NOTIFY pgrst, 'reload schema';
