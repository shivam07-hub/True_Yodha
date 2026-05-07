-- Migration: followed_companies
-- Users explicitly follow companies to track their job openings.
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.followed_companies (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, company_name)
);

CREATE INDEX IF NOT EXISTS idx_followed_companies_user_id ON public.followed_companies (user_id);

ALTER TABLE public.followed_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own follows"
    ON public.followed_companies
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.followed_companies TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.followed_companies_id_seq TO authenticated;
