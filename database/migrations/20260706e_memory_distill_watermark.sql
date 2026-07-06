-- Memory distillation watermark (User Memory Phase 2).
--
-- The distiller reads a user's recent behaviour (saved / dismissed jobs +
-- searches) SINCE this timestamp, distils durable facts into `user_memory`, then
-- advances the watermark. No buffer table — the canonical signal tables are read
-- directly, bounded by this cursor (feedback_reuse_canonical_table). NULL = never
-- distilled → the distiller uses a bounded first-run lookback instead.
--
-- Manual-apply (feedback_supabase_migrations_manual) then NOTIFY pgrst.

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS last_memory_distill_at timestamptz;

COMMENT ON COLUMN public.user_profiles.last_memory_distill_at IS
    'User Memory Phase 2 — cursor of the last behavioural distillation run. Signals newer than this are the next batch; NULL = bounded first-run lookback.';

NOTIFY pgrst, 'reload schema';
