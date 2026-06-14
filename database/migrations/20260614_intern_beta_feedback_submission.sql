-- One final intern beta assignment submission per authenticated Myro user.
-- Responses stay in the existing user_feedback table.

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_user_feedback_intern_beta_assignment_v1_user
ON public.user_feedback (user_id)
WHERE user_id IS NOT NULL
  AND type = 'feedback'
  AND payload->>'program' = 'intern_beta_assignment_v1';

NOTIFY pgrst, 'reload schema';
