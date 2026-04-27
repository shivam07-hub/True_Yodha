-- mirror_score_history had no write policy.
-- Token-scoped client (used by cv_workflow) needs INSERT on user-owned rows.
ALTER TABLE mirror_score_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own score history" ON mirror_score_history;
CREATE POLICY "own score history" ON mirror_score_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
