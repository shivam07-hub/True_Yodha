-- 20260610_drop_user_skills_correction_count.sql
-- Cleanup for the Practice→Upskilling overhaul. The "Prove it" skill-level
-- appeal (PATCH /users/me/skills/{key}/level) was retired (DEC-2 — leveling is
-- now quiz-demonstrated via skill_assessed_level), so the appeal counter column
-- is dead. All code references were removed first, so the column is already
-- unread/unwritten.
--
-- ORDERING: run this AFTER the code that stops referencing correction_count is
-- deployed to BOTH dev + prod backends. An unused column is harmless, so there
-- is no rush — this is pure cleanup, not a gate.
--
-- Manual run via Supabase dashboard per feedback_supabase_migrations_manual.
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE user_skills DROP COLUMN IF EXISTS correction_count;

COMMIT;

-- PostgREST schema cache must be reloaded after a column change or the dropped
-- column lingers in the API schema:
NOTIFY pgrst, 'reload schema';
