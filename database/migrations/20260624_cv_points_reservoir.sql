--
-- CV Experience Reservoir (v2) — Phase 1 foundation.
-- Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).
--
-- ONE table holds the whole reservoir. Each row is a single phrasing-VARIANT of a
-- point; a "point" (one atomic achievement = one experience/project bullet) is the
-- set of rows sharing `point_key`. There is deliberately NO parent `cv_points_meta`
-- table — point identity is a shared group key, and the tiny point/role metadata is
-- denormalized onto the variant rows (it changes rarely).
--
-- Phase 1 is SHADOW: this table is created + (later) backfilled from each user's
-- master cv_structured, and a pure render-from-points function is proven identical
-- to today's master. NO live consumer reads it yet — zero user-visible change.
--
-- Replaces v1's overwrite model (rewrite-bullet/apply → new master baseline; old
-- phrasing only in cv_master_revisions). v2 APPENDS phrasings to a stable point.
--
-- User-owned PII: same RLS shape as cv_versions ("own cv versions"). The service
-- role (admin client, background workers) bypasses RLS. Manual run via dashboard.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cv_points (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL,

  -- Point identity: all phrasing-variants of one achievement share this key.
  point_key      UUID         NOT NULL,

  -- Which job/project container this point renders under. Stable role id minted
  -- into the cv_structured header during migration (reorder-safe, no collision).
  role_anchor    TEXT         NOT NULL,
  section        TEXT         NOT NULL CHECK (section IN ('exp_bullet', 'proj_bullet')),

  -- The phrasing itself.
  text           TEXT         NOT NULL,
  audience_tags  TEXT[]       NOT NULL DEFAULT '{}',

  -- 768-dim == Gemini text-embedding-004 / text-embedding-3-small@768 (the pinned
  -- shared model, see embeddings.py). NULLABLE: filled async (Work-Lane), so
  -- producing a variant never blocks on the embedding call.
  embedding      vector(768),

  source         TEXT         NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('migration', 'gap_session', 'forge', 'manual', 'restructure')),

  -- The default phrasing shown when there is no JD context (the canonical line in
  -- the inventory). Exactly one canonical row per point_key is the intended state;
  -- enforced in the writer, not the schema (a point mid-edit may transiently differ).
  is_canonical   BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Ordering of the point within its role (float so inserts never renumber).
  ordering       DOUBLE PRECISION NOT NULL DEFAULT 0,

  status         TEXT         NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'archived')),

  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The common reads: a user's whole reservoir, one point's variants, points under a
-- role (for rendering the master / a projection).
CREATE INDEX IF NOT EXISTS idx_cv_points_user        ON public.cv_points (user_id);
CREATE INDEX IF NOT EXISTS idx_cv_points_point_key    ON public.cv_points (point_key);
CREATE INDEX IF NOT EXISTS idx_cv_points_user_role    ON public.cv_points (user_id, role_anchor);

-- ANN for dedup (is this phrasing new?) + per-JD selection ranking. hnsw skips
-- NULL embeddings, so async-unfilled rows simply aren't candidates yet.
CREATE INDEX IF NOT EXISTS idx_cv_points_embedding
  ON public.cv_points USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.cv_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own cv points" ON public.cv_points;
CREATE POLICY "own cv points" ON public.cv_points
  FOR ALL USING (auth.uid() = user_id);

COMMIT;
