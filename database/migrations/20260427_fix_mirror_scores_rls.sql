-- Fix mirror_scores RLS policy.
-- Original policy was FOR SELECT only, blocking CV upload (score INSERT)
-- and score recompute (score UPDATE). Server uses token-scoped client so
-- the policy must cover all operations on user-owned rows.
DROP POLICY IF EXISTS "own scores" ON mirror_scores;
CREATE POLICY "own scores" ON mirror_scores
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
