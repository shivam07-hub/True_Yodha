# ADR-0012 — Location preference is multi-chip, OR-across, settings-owned

- **Status**: Accepted (built 2026-06-02; migration manual-apply pending)
- **Date**: 2026-06-02
- **Related**: ADR-0003 (page-scoped CSS) · ADR-0010 (web/mobile shell seam — `tm:open-settings` is the canonical cross-chrome trigger) · `project_mobile_card_perplexity_accordion` (the honest-interim location line this builds on) · firecrawl `HANDOFF_multiloc_locations_array.md` (scraper-side per-city capture) · reverses Backlog #12 "parked" status

## Context

The authed `/market` feed re-asked the user to pick **country / city / mode** from three dropdowns on every visit. For a job seeker, target geography is effectively fixed — re-picking it each session is friction, and the dropdowns competed with the actual job feed for the top of the page.

Two structural facts shaped the fix:

1. **The data foundation half-existed.** `user_profiles.target_location` is a single freeform string (`"Bangalore"`, `"India (All)"`), and `target_location_country` is already derived from it via `normalize_location()` (`deps.py`, `repositories/users.py`). The personal **match pipeline already scoped candidates to that single country** (`jobs_workflow` → `get_candidate_job_ids_for_skills`). The market dropdowns were a *separate ad-hoc filter layer* bolted on top.
2. **Mode has no origin.** Onboarding never captures remote/hybrid/onsite as a *preference* — `location_mode` is a property of jobs, not users. "Fixed mode from settings" had nothing to derive from.

Backlog #12 ("multi-location targeting") was parked here, fearing a Postgres-RPC rewrite. On inspection the candidate filter is plain repository Python (`_filter_job_ids_by_location`), not an RPC — so multi-location was far cheaper than the parked note assumed.

## Decision

**Geo preference is owned by settings, not re-asked per visit. It is multi-valued, matched OR-across chips, and mode is dropped entirely.**

### 1. Canonical shape — `target_locations TEXT[]`, freeform labels
The canonical preference is `user_profiles.target_locations TEXT[]` — a list of the *same freeform labels* the single string already held (`["Bangalore", "Mumbai"]`). No new structured city/country user-facing concept; each label is parsed by the existing `normalize_location()`. The scalar singles (`target_location`, `target_location_country`) and the derived `target_location_countries TEXT[]` are **synced projections** maintained by one writer (`derive_location_columns`), so legacy readers (LLM ranker prompt, deps) never break and the four columns cannot drift. Arrays are canonical; singles are element-0.

### 2. Matching — OR-across-chips
A job matches if it matches **any** chip:
- **city chip** (label resolves to a city): `job.location_city == city` **OR** `city ∈ job.locations[]`.
- **country-only chip** (`"India (All)"`): `job.location_country == country`.
- Whenever any scope is active, null-country remote/hybrid jobs are included (mirrors the match-pipeline include rule).

This is the only model that handles the mixed case (`["Bangalore", "UK (all)"]` → Bangalore-precise **and** all-UK). Flat `cities[] AND countries[]` was rejected because it wrongly excludes a London-UK job when a specific city is also picked.

The market **feed** applies this DB-side as a PostgREST `or()` clause (`build_location_scope`) so pagination + exact counts stay correct. The **match pipeline** stays country-level only (it never used city) — single country widened to `target_location_countries[]` OR, no city-precision scope creep.

### 3. Backend-authoritative
`/jobs/feed` reads the requesting principal's `target_locations` and scopes server-side. The frontend no longer sends geo filters. Scope can't be bypassed, and there's no per-visit UI to re-pick.

### 4. Mode dropped
No mode preference exists or is created. The "All modes" dropdown is deleted, not relocated. Mode is weak-signal as a fixed pref (many want *remote OR onsite-in-my-city*) and has no backfill origin.

### 5. Settings-owned, reuse the existing modal
Editing happens in the existing `SettingsModal` (the location autocomplete becomes a chip-multiselect mirroring the role chips), **not** a new `/settings` page. The market surface shows a read-only `📍 {locations}` pill that dispatches the canonical `tm:open-settings` event (ADR-0010) — handled by both the desktop chrome and (newly) the mobile shell.

### 6. Analytics facets stay full
`by_location_*` facets (Intel / market-signal) remain unscoped. Only the personal **job feed** is pref-scoped.

### 7. firecrawl #6 consumption rides along
`jobs.locations TEXT[]` (per-city array for multi-location postings) is added and consumed now: surfaced on `JobMatch`/`JobFeedItem`, rendered as city chips by `LocationLine`, and folded into the city match (`city ∈ locations[]`). Multi-loc rows with a NULL scalar `location_city` were invisible to city filtering; this restores them the moment the scraper backfills. The scraper-side extraction is a separate sister-repo task (handoff written); the column ships empty and every consumer falls back gracefully.

## Consequences

- **Reverses Backlog #12's "parked" status.** Multi-location is shipped; the feared RPC rewrite did not exist.
- **Match results widen** for any user who sets multiple target countries (OR pool). Intended.
- **Migration is manual-apply** (`20260602_multiloc_target_locations.sql`) per the Supabase manual-apply rule — hard pre-deploy gate; it backfills arrays from the existing singles and is idempotent.
- **`target_location` (single freeform) stays** as onboarding's raw capture; onboarding UI is unchanged this round. Multi-pick is a settings-only power feature (cap 5).
- A user with **zero prefs** gets an unscoped feed (all jobs) and a `📍 All locations` pill — no empty-state nag.
