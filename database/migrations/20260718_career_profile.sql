-- 20260718_career_profile — the recruiter/logistics fact-layer, captured once.
--
-- Career Profile capture (grill-locked 2026-07-18, Delta-4). Myro captures the
-- recruiter fact-layer (comp / notice / quota / targets / reporting line /
-- availability / new-logos / experience splits) once, then reuses it: the Myro
-- extension auto-fills ATS application forms (P2) and the persona/Prep/₹99 plan
-- surface it (P3). The felt delta = never re-type an application form.
--
-- ONE row per user. `data` jsonb IS the typed contract — its shape is defined and
-- validated by the Pydantic CareerProfile model (app/schemas/career_profile.py),
-- same pattern as user_persona.paragraphs. Kept as jsonb (not 15 columns) so the
-- progressive field set can evolve without a migration each time; the extension
-- and mini-form read the Pydantic-validated endpoint, never the table directly.
--
-- Write-through: on PUT the app also mirrors a prose summary into user_memory
-- (tagged resolved->>'origin' = 'career_profile') so persona/recall stay fed from
-- one source of truth.
--
-- Apply: Supabase SQL editor / MCP, then NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.career_profile (
    user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    data       jsonb NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.career_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own career_profile" ON public.career_profile;
CREATE POLICY "own career_profile" ON public.career_profile
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_profile TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
