-- 20260715b_user_persona — Lane B "What Myro knows about you" open canvas.
--
-- ONE living document per user, synthesized by the persona writer from the
-- evidence substrate (career_stories/roles, user_memory facts, behavioural
-- signals: saved/dismissed/tailored/searches/practice). Grill locks 2026-07-14:
--   * one editable prose canvas in three movements (past/present/future)
--   * USER EDITS ARE LAW — user-authored paragraphs are pinned, synthesis
--     regenerates only unpinned prose and never contradicts a pinned passage
--   * facts/stories stay the invisible evidence substrate
--
-- paragraphs JSONB shape (self-contained; grounds are resolved display lines):
--   [{"id": uuid-str, "movement": "past"|"present"|"future", "text": str,
--     "author": "myro"|"user", "pinned": bool, "grounds": [str, ...]}]
--
-- Apply: Supabase SQL editor / MCP, then NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_persona (
    user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    paragraphs   jsonb NOT NULL DEFAULT '[]',
    generated_at timestamptz,
    model        text,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_persona ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own persona" ON public.user_persona;
CREATE POLICY "own persona" ON public.user_persona
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_persona TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
