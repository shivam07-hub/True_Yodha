-- 20260524 — Magic-link send attempts (rate-limit table)
--
-- ADR-0006 §10: Magic-link rate-limit = 3 sends/hour/IP. Backed by this
-- append-only audit table + a sliding-window counter helper. Wrapping
-- Supabase signInWithOtp() in the backend lets us count IP attempts
-- across the OTP send surface — Supabase's built-in throttle is per-user
-- which doesn't catch spray-style abuse.
--
-- IP is captured server-side from X-Forwarded-For / X-Real-IP / direct
-- peer address. Email is normalised (lowercase, trimmed) so the same
-- address with different casing is counted once.

CREATE TABLE IF NOT EXISTS public.magic_link_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    ip text NOT NULL,
    user_agent text,
    sent_at timestamptz NOT NULL DEFAULT now(),
    outcome text NOT NULL DEFAULT 'sent' CHECK (outcome IN ('sent', 'rate_limited', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_magic_link_attempts_ip_sent_at
    ON public.magic_link_attempts (ip, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_magic_link_attempts_email_sent_at
    ON public.magic_link_attempts (email, sent_at DESC);

COMMENT ON TABLE public.magic_link_attempts IS
    'ADR-0006 §10 rate-limit audit. Append-only. 3 sends / hour / IP enforced via count_magic_link_attempts_ip().';

-- Sliding-window count of attempts from a single IP in the last N minutes.
-- Used by POST /auth/magic-link-request to enforce the cap before calling
-- Supabase signInWithOtp().
CREATE OR REPLACE FUNCTION public.count_magic_link_attempts_ip(
    p_ip text,
    p_minutes integer DEFAULT 60
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::integer
    FROM public.magic_link_attempts
    WHERE ip = p_ip
      AND outcome = 'sent'
      AND sent_at > now() - (p_minutes || ' minutes')::interval
$$;

GRANT EXECUTE ON FUNCTION public.count_magic_link_attempts_ip(text, integer) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
