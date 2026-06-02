-- 20260602 — multi-location target preferences + per-job locations[]
--
-- Geo preference becomes "fixed from settings": the market feed stops asking
-- the user to re-pick country/city/mode on every visit and instead scopes to
-- the user's saved location preferences. A user can target several locations
-- (e.g. Bangalore + Mumbai, or "India (All)"), so the single freeform
-- `target_location` string is generalised to an array of the same freeform
-- labels. Each label is parsed by the existing normalize_location() machinery
-- (city / country derivation is unchanged) and matching is OR-across-chips.
--
-- `target_location` + `target_location_country` stay as synced scalar
-- projections (element 0) for legacy readers — arrays are canonical, the
-- single writer in repositories/users.py keeps both in lockstep so there is
-- no drift.
--
-- jobs.locations[] is the consumption half of firecrawl backlog #6: multi-city
-- postings currently collapse to a "N Locations" count phrase with a NULL
-- location_city, making them invisible to city filtering. This column is the
-- canonical per-city array the scraper will populate (see the scraper-side
-- handoff). It defaults to '{}' and the True_Yodha read/filter/render path
-- falls back to the scalar location_city until the scraper backfills, so this
-- column is safe to ship empty.
--
-- Idempotent: re-runnable. Manual-apply via Supabase MCP apply_migration.

-- ── user_profiles: multi-location preferences ───────────────────────────────
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS target_locations TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS target_location_countries TEXT[] NOT NULL DEFAULT '{}';

-- Backfill from the existing scalar singles. Only seed where the array is still
-- empty (idempotent) and the scalar is present.
UPDATE public.user_profiles
SET target_locations = ARRAY[target_location]
WHERE cardinality(target_locations) = 0
  AND target_location IS NOT NULL
  AND length(trim(target_location)) > 0;

UPDATE public.user_profiles
SET target_location_countries = ARRAY[target_location_country]
WHERE cardinality(target_location_countries) = 0
  AND target_location_country IS NOT NULL
  AND length(trim(target_location_country)) > 0;

-- ── jobs: per-city array (firecrawl #6 consumption column) ───────────────────
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS locations TEXT[] NOT NULL DEFAULT '{}';

-- Seed single-city rows so the array is always populated where a scalar city
-- exists (locations[0] == location_city invariant). Multi-location rows with a
-- NULL location_city stay empty until the scraper extracts real cities.
UPDATE public.jobs
SET locations = ARRAY[location_city]
WHERE cardinality(locations) = 0
  AND location_city IS NOT NULL
  AND length(trim(location_city)) > 0;

COMMENT ON COLUMN public.user_profiles.target_locations IS
    'Canonical multi-location target preference: freeform labels (same format as target_location). Parsed by normalize_location(); matching is OR-across-chips. target_location = element 0 (legacy).';
COMMENT ON COLUMN public.user_profiles.target_location_countries IS
    'Derived country set from target_locations, for the country-only match pipeline. target_location_country = element 0 (legacy).';
COMMENT ON COLUMN public.jobs.locations IS
    'Canonical per-city array for multi-location postings (firecrawl #6). location_city = element 0. Empty until the scraper backfills multi-loc rows.';

-- Reload PostgREST schema cache so the new columns are visible to the API.
NOTIFY pgrst, 'reload schema';
