-- 20260529b — Newsletter subscribers
--
-- Backs POST /newsletter/subscribe. The landing + /newsletter EmailSubscribe
-- widget was UI-only (button flipped to "Subscribed!" but the email went
-- nowhere). This persists it.
--
-- Append-once-per-email: UNIQUE(email) on a normalised (lower/trim) address
-- so the same address in different casing counts once. Re-subscribing the
-- same email is idempotent — the endpoint returns ok without erroring, no
-- enumeration signal (the user typed their own address).
--
-- IP captured server-side from X-Forwarded-For / X-Real-IP / peer addr,
-- rate-limited to 10 inserts/hour/IP to stop spray-style garbage flooding.
-- user_id is set when an authenticated user subscribes, NULL for anon.

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'landing', 'newsletter_page', 'app')),
    status text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ip text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Normalised-email uniqueness — same address, any casing, counted once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_lower
    ON public.newsletter_subscribers (lower(email));

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_ip_created_at
    ON public.newsletter_subscribers (ip, created_at DESC);

COMMENT ON TABLE public.newsletter_subscribers IS
    'Newsletter opt-ins. UNIQUE on lower(email); re-subscribe is idempotent. 10 inserts/hour/IP enforced via count_newsletter_attempts_ip().';

-- Sliding-window count of subscribe attempts from a single IP in the last
-- N minutes. Used by POST /newsletter/subscribe before the insert.
CREATE OR REPLACE FUNCTION public.count_newsletter_attempts_ip(
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
    FROM public.newsletter_subscribers
    WHERE ip = p_ip
      AND created_at > now() - (p_minutes || ' minutes')::interval
$$;

GRANT EXECUTE ON FUNCTION public.count_newsletter_attempts_ip(text, integer) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
