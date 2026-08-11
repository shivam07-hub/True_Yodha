-- Followed Companies: one canonical identity, atomic cap enforcement, and
-- explicit-user-only writes. The API invokes the RPC with the caller's JWT;
-- the functions verify that JWT owns p_user_id before bypassing row policies.
BEGIN;

ALTER TABLE public.followed_companies
    ADD COLUMN IF NOT EXISTS company_id BIGINT
        REFERENCES public.companies(id) ON DELETE RESTRICT;

-- Every existing follow already resolves through an alias. Resolve any later
-- historical row too, then retain the canonical name only as display/audit
-- data while company_id becomes the relational identity.
UPDATE public.followed_companies AS follow
SET company_id = public.resolve_company_entity(follow.company_name)
WHERE follow.company_id IS NULL;

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, company_id
               ORDER BY created_at DESC, id DESC
           ) AS row_number
    FROM public.followed_companies
)
DELETE FROM public.followed_companies AS follow
USING ranked
WHERE follow.id = ranked.id
  AND ranked.row_number > 1;

UPDATE public.followed_companies AS follow
SET company_name = company.canonical_name
FROM public.companies AS company
WHERE company.id = follow.company_id
  AND follow.company_name IS DISTINCT FROM company.canonical_name;

ALTER TABLE public.followed_companies
    ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.followed_companies
    DROP CONSTRAINT IF EXISTS followed_companies_user_id_company_name_key;
ALTER TABLE public.followed_companies
    DROP CONSTRAINT IF EXISTS followed_companies_user_id_company_id_key;
ALTER TABLE public.followed_companies
    ADD CONSTRAINT followed_companies_user_id_company_id_key
        UNIQUE (user_id, company_id);

CREATE INDEX IF NOT EXISTS idx_followed_companies_user_created
    ON public.followed_companies (user_id, created_at DESC);

-- Direct mutation is deliberately unavailable. Read RLS stays least-privilege;
-- the two functions below are the only write seam and validate auth.uid().
DROP POLICY IF EXISTS "Users manage their own follows" ON public.followed_companies;
DROP POLICY IF EXISTS "Users read their own follows" ON public.followed_companies;
CREATE POLICY "Users read their own follows"
    ON public.followed_companies
    FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND COALESCE((SELECT auth.jwt() ->> 'is_anonymous')::BOOLEAN, FALSE) = FALSE
    );

REVOKE ALL ON TABLE public.followed_companies FROM anon, authenticated;
GRANT SELECT ON TABLE public.followed_companies TO authenticated;

CREATE OR REPLACE FUNCTION public.follow_company(
    p_user_id UUID,
    p_company_name TEXT
)
RETURNS TABLE (
    outcome TEXT,
    company_id BIGINT,
    company_name TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_name TEXT;
    v_company_id BIGINT;
    v_company_name TEXT;
    v_created_at TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    IF (SELECT auth.uid()) IS NULL
       OR (SELECT auth.uid()) IS DISTINCT FROM p_user_id
       OR COALESCE((SELECT auth.jwt() ->> 'is_anonymous')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Followed Company access denied' USING ERRCODE = '42501';
    END IF;

    v_name := REGEXP_REPLACE(BTRIM(p_company_name), '\s+', ' ', 'g');
    IF v_name = '' THEN
        RAISE EXCEPTION 'company_name required' USING ERRCODE = '22023';
    END IF;

    -- A transaction-scoped per-user lock makes the ten-slot check atomic while
    -- allowing unrelated candidates to follow independently.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::TEXT, 0)
    );
    v_company_id := public.resolve_company_entity(v_name);

    SELECT follow.company_name, follow.created_at
    INTO v_company_name, v_created_at
    FROM public.followed_companies AS follow
    WHERE follow.user_id = p_user_id
      AND follow.company_id = v_company_id;
    IF FOUND THEN
        RETURN QUERY SELECT 'already_following', v_company_id, v_company_name, v_created_at;
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.followed_companies AS follow
    WHERE follow.user_id = p_user_id;
    IF v_count >= 10 THEN
        RETURN QUERY SELECT 'limit_reached', NULL::BIGINT, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT canonical_name INTO v_company_name
    FROM public.companies
    WHERE id = v_company_id;

    INSERT INTO public.followed_companies AS follow (user_id, company_id, company_name)
    VALUES (p_user_id, v_company_id, v_company_name)
    RETURNING follow.created_at INTO v_created_at;

    RETURN QUERY SELECT 'followed', v_company_id, v_company_name, v_created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.unfollow_company(
    p_user_id UUID,
    p_company_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_name_key TEXT;
    v_company_id BIGINT;
    v_deleted BOOLEAN;
BEGIN
    IF (SELECT auth.uid()) IS NULL
       OR (SELECT auth.uid()) IS DISTINCT FROM p_user_id
       OR COALESCE((SELECT auth.jwt() ->> 'is_anonymous')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Followed Company access denied' USING ERRCODE = '42501';
    END IF;

    v_name_key := LOWER(REGEXP_REPLACE(BTRIM(p_company_name), '\s+', ' ', 'g'));
    IF v_name_key = '' THEN
        RETURN FALSE;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::TEXT, 0)
    );
    SELECT alias.company_id INTO v_company_id
    FROM public.company_aliases AS alias
    WHERE alias.alias_key = v_name_key;

    DELETE FROM public.followed_companies AS follow
    WHERE follow.user_id = p_user_id
      AND (
          follow.company_id = v_company_id
          OR LOWER(REGEXP_REPLACE(BTRIM(follow.company_name), '\s+', ' ', 'g')) = v_name_key
      )
    RETURNING TRUE INTO v_deleted;

    RETURN COALESCE(v_deleted, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.follow_company(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unfollow_company(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follow_company(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_company(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
