-- User Memory (Phase 1) — the persistent "knows me" store.
--
-- ONE canonical store for the user's NON-COLUMNIZED context: aspirations, dreams,
-- constraints, habits, salary target, work-mode preference, free notes. Facts
-- already owning a profile column (target_role/location/seniority/companies) keep
-- those columns as their source — memory does NOT shadow them (no dual-source
-- drift). Phase-2 distillation writes inferred structured changes through the
-- EXISTING setters (save_target etc.), not here.
--
-- Two writers (grill 2026-07-06 = C): `source='authored'` (user brain-dump / edit)
-- and `source='distilled'` (Phase-2 LLM). Every fact is user-visible + editable
-- (PV1). `resolved` holds a canonical projection payload for structured kinds;
-- null for freeform. `embedding` (semantic "search that knows me", Phase 4) is a
-- deliberate LATER migration — unused columns are dead weight until then.
--
-- Manual-apply (feedback_supabase_migrations_manual) then NOTIFY pgrst.

CREATE TABLE IF NOT EXISTS public.user_memory (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN (
                    'aspiration', 'constraint', 'habit', 'preference',
                    'salary', 'work_mode', 'target_company', 'note'
                )),
    text        text NOT NULL,
    resolved    jsonb,
    source      text NOT NULL DEFAULT 'authored' CHECK (source IN ('authored', 'distilled')),
    confidence  real,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user_status
    ON public.user_memory (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_memory_user_kind
    ON public.user_memory (user_id, kind);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY user_memory_own_select ON public.user_memory
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY user_memory_own_insert ON public.user_memory
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY user_memory_own_update ON public.user_memory
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY user_memory_own_delete ON public.user_memory
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.user_memory IS
    'Canonical non-columnized user context (aspirations/constraints/habits/salary/work_mode/notes). Two writers: authored + distilled. RLS own-only. PV1.';

NOTIFY pgrst, 'reload schema';
