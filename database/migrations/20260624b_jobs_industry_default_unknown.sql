-- Harden jobs.industry against extension-imported jobs.
--
-- jobs.industry is NOT NULL with no default. Scraper rows always set a real
-- industry, but POST /jobs/import (extension save) genuinely doesn't know it
-- at LinkedIn save-time and was passing NULL -> 23502 not-null violation -> 500.
--
-- Matches the existing location_mode / location_quality convention on this
-- same table (NOT NULL + 'unknown' default). The application code
-- (services/job_importer.build_imported_job) also now passes 'unknown'; this
-- default is the belt-and-suspenders so no future null-passer can crash.
--
-- SET DEFAULT is metadata-only (instant, no table rewrite) -> safe on the
-- shared prod DB.
--
-- APPLIED to gipvxuugajkugntwkeiz via Supabase MCP 2026-06-24 (verified:
-- industry NOT NULL, default 'unknown'::text). Single shared DB = dev+prod.

ALTER TABLE jobs ALTER COLUMN industry SET DEFAULT 'unknown';
