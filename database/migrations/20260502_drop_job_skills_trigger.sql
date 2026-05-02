-- Migration: drop the backward-compat trigger that synced jobs.main_skills/side_skills → job_skills
--
-- Context: The trigger was created in 20260427_job_skills_table.sql as a crutch to allow
-- the scraper (firecrawl_Supabase) to keep writing TEXT arrays while the backend read from
-- job_skills. The scraper now writes directly to job_skills via csv_importer.py, so the
-- trigger is no longer needed.
--
-- The main_skills and side_skills columns on `jobs` are NOT dropped in this migration.
-- They are retained temporarily so existing data remains visible if needed.
-- Drop them in a subsequent migration after verifying all writes go through job_skills.
--
-- Run: copy-paste into Supabase SQL editor and execute once.

DROP TRIGGER IF EXISTS sync_job_skills_trigger ON jobs;
DROP FUNCTION IF EXISTS sync_job_skills_from_arrays();

-- Verify: check no trigger remains on jobs table
-- SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'jobs';
