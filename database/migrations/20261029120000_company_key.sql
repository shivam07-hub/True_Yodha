-- One company, one key (CONTEXT → Company Identity).
--
-- resolve_company_entity stripped every character outside a-z0-9 BEFORE it
-- lowercased, so capitals vanished: "OpenAI" keyed `pen`, Meta and Zeta both
-- keyed `eta`, KPMG / EY / BDO India all keyed `ndia`. Four ids held ten
-- employers. The scraper resolves through this function on every run, fetches
-- the company's jobs by id, and closes what its run did not see — so Zeta's run
-- closed all 36 of Meta's listings, KPMG India's closed EY India's 71 and BDO
-- India's 32, and DBS Bank and ANZ Bank closed each other every day.
--
-- The key now lowercases first. Spellings that differ only by case, spacing or
-- punctuation are one company (Shivam, 2026-10-29); anything else joins only
-- through an explicit alias row.
--
-- Repair: every alias the broken key wrote that names a different company is
-- moved to its own company, and the jobs and source runs filed under the wrong
-- id follow their name. Follows stay on the id they show (ANZ Bank, EY India).
-- The scraper's next run reopens the listings it sees — nothing is reopened here.
-- Reverse: the six aliases were Binance, L&T Finance → 27; DBS Bank → 54;
-- BDO India, KPMG India → 230; Meta → 257. Jobs and runs follow their alias.
-- 1,464 jobs with no company_id are left as they are: filling them would put
-- listings from other sources inside a trusted run's close step.

BEGIN;

-- ── the two keys ────────────────────────────────────────────────────────────

-- The spelling, folded for case and spacing: what an alias row is keyed by.
CREATE OR REPLACE FUNCTION public.company_alias_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT NULLIF(LOWER(REGEXP_REPLACE(BTRIM(p_name), '\s+', ' ', 'g')), '')
$$;

-- The company: letters and digits only, lowercased FIRST. A name with no
-- ASCII letter or digit keeps a stable key of its own.
CREATE OR REPLACE FUNCTION public.company_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN NULLIF(BTRIM(p_name), '') IS NULL THEN NULL
        ELSE COALESCE(
            NULLIF(REGEXP_REPLACE(LOWER(BTRIM(p_name)), '[^a-z0-9]+', '', 'g'), ''),
            'company' || MD5(LOWER(BTRIM(p_name)))
        )
    END
$$;

-- ── the resolver and the read ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_company_entity(p_company_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_alias_key TEXT := public.company_alias_key(p_company_name);
    v_key TEXT := public.company_key(p_company_name);
    v_company_id BIGINT;
BEGIN
    IF v_alias_key IS NULL THEN
        RAISE EXCEPTION 'company name is required';
    END IF;
    SELECT company_id INTO v_company_id
    FROM public.company_aliases WHERE alias_key = v_alias_key;
    IF v_company_id IS NOT NULL THEN
        RETURN v_company_id;
    END IF;

    INSERT INTO public.companies (canonical_key, canonical_name, slug)
    VALUES (v_key, BTRIM(p_company_name), v_key)
    ON CONFLICT (canonical_key) DO UPDATE SET updated_at = NOW()
    RETURNING id INTO v_company_id;
    INSERT INTO public.company_aliases (alias_key, alias_name, company_id, source)
    VALUES (v_alias_key, BTRIM(p_company_name), v_company_id, 'resolver')
    ON CONFLICT (alias_key) DO UPDATE SET company_id = EXCLUDED.company_id;
    RETURN v_company_id;
END;
$$;

-- Read-only: the company a name means, or nothing. Never mints one.
CREATE OR REPLACE FUNCTION public.company_for_name(p_company_name text)
RETURNS TABLE (id bigint, canonical_name text, slug text)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT c.id, c.canonical_name, c.slug
    FROM public.companies AS c
    WHERE c.id = COALESCE(
        (SELECT a.company_id FROM public.company_aliases AS a
         WHERE a.alias_key = public.company_alias_key(p_company_name)),
        (SELECT k.id FROM public.companies AS k
         WHERE k.canonical_key = public.company_key(p_company_name))
    )
$$;

CREATE OR REPLACE FUNCTION public.unfollow_company(p_user_id uuid, p_company_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

    v_name_key := public.company_alias_key(p_company_name);
    IF v_name_key IS NULL THEN
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
          OR public.company_alias_key(follow.company_name) = v_name_key
      )
    RETURNING TRUE INTO v_deleted;

    RETURN COALESCE(v_deleted, FALSE);
END;
$$;

-- ── re-key every company ────────────────────────────────────────────────────
-- Checked before applying: no two companies share a corrected key, and
-- slug = canonical_key on every row. Two steps, so a row's new key never meets
-- another row's old one mid-statement.

CREATE TEMP TABLE company_rekey ON COMMIT DROP AS
SELECT id, public.company_key(canonical_name) AS k
FROM public.companies
WHERE canonical_key IS DISTINCT FROM public.company_key(canonical_name);

UPDATE public.companies AS c
SET canonical_key = 'rekey:' || c.id, slug = 'rekey:' || c.id
FROM company_rekey AS r WHERE r.id = c.id;

UPDATE public.companies AS c
SET canonical_key = r.k, slug = r.k, updated_at = NOW()
FROM company_rekey AS r WHERE r.id = c.id;

-- ── split what the broken key merged ────────────────────────────────────────
-- Only aliases the broken key wrote. A manual alias that joins two spellings
-- on purpose is not a mistake.

CREATE TEMP TABLE misfiled_alias ON COMMIT DROP AS
SELECT a.alias_key, a.alias_name, a.created_at, public.company_key(a.alias_name) AS k
FROM public.company_aliases AS a
JOIN public.companies AS c ON c.id = a.company_id
WHERE a.source IN ('jobs_backfill', 'resolver')
  AND public.company_key(a.alias_name) <> c.canonical_key;

INSERT INTO public.companies (canonical_key, canonical_name, slug)
SELECT DISTINCT ON (m.k) m.k, BTRIM(m.alias_name), m.k
FROM misfiled_alias AS m
ORDER BY m.k, m.created_at
ON CONFLICT (canonical_key) DO NOTHING;

UPDATE public.company_aliases AS a
SET company_id = t.id
FROM misfiled_alias AS m
JOIN public.companies AS t ON t.canonical_key = m.k
WHERE a.alias_key = m.alias_key;

-- The jobs and source runs follow their name. A run's skill facts follow the run.
UPDATE public.jobs AS j
SET company_id = a.company_id
FROM public.company_aliases AS a
WHERE a.alias_key = public.company_alias_key(j.company_name)
  AND j.company_id IS NOT NULL
  AND j.company_id <> a.company_id;

UPDATE public.job_source_runs AS r
SET company_id = a.company_id
FROM public.company_aliases AS a
WHERE a.alias_key = public.company_alias_key(r.company_name)
  AND r.company_id IS NOT NULL
  AND r.company_id <> a.company_id;

UPDATE public.company_skill_run_facts AS f
SET company_id = r.company_id
FROM public.job_source_runs AS r
WHERE r.id = f.source_run_id
  AND r.company_id IS NOT NULL
  AND f.company_id <> r.company_id;

COMMIT;
