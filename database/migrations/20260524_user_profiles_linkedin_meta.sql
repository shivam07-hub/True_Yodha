-- 20260524 — user_profiles LinkedIn metadata (granted partner-scope read fields)
--
-- ADR-0006 L4: LinkedIn partner scopes (r_profile_basicinfo + r_verify)
-- ship the vanity URL, headline, and verification status directly in the
-- OIDC ID token. POST /auth/post-signin parses those claims and writes
-- to these columns. The original `linkedin_url` column was added in an
-- earlier migration; this adds the additional surface.
--
-- Defaults safe for existing rows. No backfill needed — values populate
-- on the user's next /auth/post-signin call.

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS linkedin_headline text,
    ADD COLUMN IF NOT EXISTS linkedin_verified boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS linkedin_xp_granted boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_profiles.linkedin_headline IS
    'ADR-0006 L4 — LinkedIn headline from OIDC ID token (r_profile_basicinfo scope).';

COMMENT ON COLUMN public.user_profiles.linkedin_verified IS
    'ADR-0006 L4 — LinkedIn verification status from OIDC ID token (r_verify scope).';

COMMENT ON COLUMN public.user_profiles.linkedin_xp_granted IS
    'ADR-0006 L4 — guards the one-time 50 XP grant for connecting a LinkedIn identity.';

NOTIFY pgrst, 'reload schema';
