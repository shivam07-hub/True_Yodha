-- Durable generic-feedback delivery.
--
-- Clients keep a feedback draft in an outbox and replay the same UUID through
-- Idempotency-Key until the API returns a receipt. The unique index is the
-- correctness boundary for concurrent retries; the SHA-256 fingerprint keeps
-- an accidentally reused key from acknowledging different content.

ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT;

ALTER TABLE public.user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_idempotency_pair_check;

ALTER TABLE public.user_feedback
  ADD CONSTRAINT user_feedback_idempotency_pair_check
  CHECK (
    (idempotency_key IS NULL AND idempotency_fingerprint IS NULL)
    OR (
      idempotency_key IS NOT NULL
      AND idempotency_fingerprint IS NOT NULL
      AND char_length(idempotency_fingerprint) = 64
      AND idempotency_fingerprint ~ '^[0-9a-f]{64}$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_user_feedback_idempotency_key
ON public.user_feedback (idempotency_key)
WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.user_feedback.idempotency_key IS
  'Client-generated UUID from Idempotency-Key; unique delivery receipt key.';

COMMENT ON COLUMN public.user_feedback.idempotency_fingerprint IS
  'SHA-256 of canonical feedback type and payload; detects key reuse.';

NOTIFY pgrst, 'reload schema';
