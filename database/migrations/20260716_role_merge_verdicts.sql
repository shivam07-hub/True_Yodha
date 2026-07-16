-- Role-merge verdicts — backlog #38 (role-dedup judge).
-- One row = one (user, role pair) ruling: the judge's auto-fold / proposal /
-- keep-separate, or the USER's decision from a Stories-tab merge card.
-- A human ruling is LAW: the judge never re-litigates a decided pair
-- (edits-are-law, same principle as the persona canvas). Pair is stored
-- normalized (role_a < role_b as text) so each pair has exactly one row.
--
-- Apply on Supabase, then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS role_merge_verdicts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- No FK: roles archive rather than delete, and a verdict must outlive both.
  role_a     uuid NOT NULL,
  role_b     uuid NOT NULL,
  -- proposed      = judge says same_maybe → Stories-tab merge card pending
  -- auto_folded   = judge said same_high → folded silently (receipt line)
  -- merged        = user tapped Merge on a card
  -- keep_separate = user tapped Keep separate, OR judge ruled different
  verdict    text NOT NULL CHECK (verdict IN ('proposed', 'auto_folded', 'merged', 'keep_separate')),
  decided_by text NOT NULL DEFAULT 'judge' CHECK (decided_by IN ('judge', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role_a < role_b),
  UNIQUE (user_id, role_a, role_b)
);

CREATE INDEX IF NOT EXISTS idx_role_merge_verdicts_user
  ON role_merge_verdicts (user_id, verdict);

ALTER TABLE role_merge_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_merge_verdicts_own ON role_merge_verdicts;
CREATE POLICY role_merge_verdicts_own ON role_merge_verdicts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
