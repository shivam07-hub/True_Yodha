-- 20260526 — reconcile user_job_matches uniqueness with weekly refresh contract
--
-- Root cause: some environments still carry a legacy unique constraint on
-- (user_id, job_id). The refresh pipeline upserts on (user_id, job_id, batch_week)
-- and fails with 23505 when the same job reappears in a later week.

BEGIN;

-- Keep only one row per weekly cache key if drift already introduced duplicates.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, job_id, batch_week
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
    -- Drop every legacy UNIQUE constraint that enforces only (user_id, job_id),
    -- regardless of environment-specific constraint names.
    FOR uq IN
        SELECT con.conname AS constraint_name
        FROM pg_constraint con
        JOIN pg_class tbl ON tbl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        JOIN LATERAL (
            SELECT array_agg(att.attname ORDER BY key_pos.ordinality) AS cols
            FROM unnest(con.conkey) WITH ORDINALITY AS key_pos(attnum, ordinality)
            JOIN pg_attribute att
              ON att.attrelid = con.conrelid
             AND att.attnum = key_pos.attnum
        ) keys ON TRUE
        WHERE ns.nspname = 'public'
          AND tbl.relname = 'user_job_matches'
          AND con.contype = 'u'
          AND keys.cols = ARRAY['user_id', 'job_id']::text[]
    LOOP
        EXECUTE format(
            'ALTER TABLE public.user_job_matches DROP CONSTRAINT %I',
            uq.constraint_name
        );
    END LOOP;

    -- Drop any legacy unique indexes that enforce only (user_id, job_id).
    FOR idx IN
        SELECT cls.relname AS index_name
        FROM pg_index ind
        JOIN pg_class cls ON cls.oid = ind.indexrelid
        JOIN pg_class tbl ON tbl.oid = ind.indrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        LEFT JOIN pg_constraint con ON con.conindid = ind.indexrelid
        JOIN LATERAL (
            SELECT array_agg(att.attname ORDER BY key_pos.ordinality) AS cols
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
          AND keys.cols = ARRAY['user_id', 'job_id']::text[]
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.index_name);
    END LOOP;
END $$;

-- Canonical weekly uniqueness for Job Matches cache writes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_job_matches_unique
    ON public.user_job_matches (user_id, job_id, batch_week);

NOTIFY pgrst, 'reload schema';

COMMIT;
