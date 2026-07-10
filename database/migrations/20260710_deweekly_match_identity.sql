-- 20260710 — de-weekly Job Matches eval identity (Backlog #36, Slice 1)
--
-- Supersedes the weekly-snapshot model (20260526_user_job_matches_weekly_uniqueness).
-- Scrapes are continuous/event-driven now, not weekly — an eval is a permanent
-- per-(user,job) fact, reused forever until a real recompute overwrites it.
-- `batch_week` COLUMN is KEPT (still written/displayed for provenance); it is
-- REMOVED from the identity key so re-evaluating the same job in a later "week"
-- upserts in place instead of creating a duplicate row.

BEGIN;

-- Dedupe down to one row per (user_id, job_id) — keep the newest by computed_at
-- (mirrors the 20260526 dedupe pattern, one partition key narrower).
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, job_id
            ORDER BY computed_at DESC NULLS LAST, id DESC
        ) AS rn
    FROM public.user_job_matches
)
DELETE FROM public.user_job_matches m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

DO $$
DECLARE
    uq RECORD;
    idx RECORD;
BEGIN
    -- Drop every UNIQUE constraint keyed (user_id, job_id, batch_week).
    FOR uq IN
        SELECT con.conname AS constraint_name
        FROM pg_constraint con
        JOIN pg_class tbl ON tbl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        JOIN LATERAL (
            SELECT array_agg(att.attname::text ORDER BY key_pos.ordinality) AS cols
            FROM unnest(con.conkey) WITH ORDINALITY AS key_pos(attnum, ordinality)
            JOIN pg_attribute att
              ON att.attrelid = con.conrelid
             AND att.attnum = key_pos.attnum
        ) keys ON TRUE
        WHERE ns.nspname = 'public'
          AND tbl.relname = 'user_job_matches'
          AND con.contype = 'u'
          AND keys.cols = ARRAY['user_id', 'job_id', 'batch_week']::text[]
    LOOP
        EXECUTE format(
            'ALTER TABLE public.user_job_matches DROP CONSTRAINT %I',
            uq.constraint_name
        );
    END LOOP;

    -- Drop any unique indexes keyed (user_id, job_id, batch_week).
    FOR idx IN
        SELECT cls.relname AS index_name
        FROM pg_index ind
        JOIN pg_class cls ON cls.oid = ind.indexrelid
        JOIN pg_class tbl ON tbl.oid = ind.indrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        LEFT JOIN pg_constraint con ON con.conindid = ind.indexrelid
        JOIN LATERAL (
            SELECT array_agg(att.attname::text ORDER BY key_pos.ordinality) AS cols
            FROM unnest(ind.indkey) WITH ORDINALITY AS key_pos(attnum, ordinality)
            JOIN pg_attribute att
              ON att.attrelid = ind.indrelid
             AND att.attnum = key_pos.attnum
            WHERE key_pos.attnum > 0
        ) keys ON TRUE
        WHERE ns.nspname = 'public'
          AND tbl.relname = 'user_job_matches'
          AND ind.indisunique
          AND con.oid IS NULL
          AND keys.cols = ARRAY['user_id', 'job_id', 'batch_week']::text[]
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.index_name);
    END LOOP;
END $$;

-- Canonical permanent eval identity — one row per (user, job), ever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_job_matches_unique
    ON public.user_job_matches (user_id, job_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
