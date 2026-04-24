# Mirko Universal Job Tracker Extension Design

Date: 2026-04-24
Status: Approved for implementation planning
Product name: Mirko

## Goal

Build the first Mirko Chrome extension as a universal "Track this job" tool. A candidate should be able to open any job page, click Mirko, review the captured job details, and save the job into their existing tracker.

The extension must capture the same job intelligence the platform already uses:

- Role name
- Company name, when available
- Location
- Job description
- Primary skills
- Secondary skills
- Source URL
- Source platform

Every saved extension job should be persisted to the Supabase `jobs` table and linked to the current user through `job_applications` with status `pending`.

## Product Principles

Mirko suggests; the user confirms; the backend validates and persists.

The extension should never silently save scraped content or hidden page data. It should capture the current visible job context, let the user review and edit it, and save only after explicit confirmation.

The system should work on any job page as a best-effort capture layer. Known portals should get more accurate extraction through portal adapters, while messy or unsupported sites should use selected text as the reliable fallback.

## Existing Context

The current app already has:

- FastAPI jobs router at `backend/app/routers/jobs.py`
- Job schemas at `backend/app/schemas/jobs.py`
- Skill tagging logic at `backend/app/services/skill_tagger.py`
- Job matching logic at `backend/app/services/job_matcher.py`
- Supabase `jobs`, `user_job_matches`, and `job_applications` tables in `database/schema.sql`
- Next.js job tracker UI at `frontend/app/tracker/page.tsx`

The external Firecrawl registry at `/Users/incognito/Mirror CV/firecrawl_Supabase/KNOWN_PORTALS.md` should inform known portal adapters. It defines ATS families and canonical field maps for Workday, Greenhouse, SmartRecruiters, Amazon Jobs, Eightfold, and other portals.

## User Flow

1. User opens a job page in Chrome.
2. User clicks the Mirko extension.
3. Mirko attempts extraction in this order:
   - Selected text, if the user selected text before opening Mirko
   - Known portal adapter
   - JSON-LD `JobPosting` metadata
   - Generic visible page extraction
4. Mirko opens a compact review panel.
5. Backend returns suggested primary and secondary skills.
6. User edits role, company, location, description, and skill chips.
7. User saves.
8. Backend validates the confirmed payload.
9. Backend upserts the job into `jobs`.
10. Backend upserts a `job_applications` row for the user with status `pending`.
11. The job appears in the existing tracker.

If Mirko cannot confidently find the job description, the panel should ask the user to select the job description on the page and click "Capture selected text."

## Extension UI

The first version should be a compact side panel or popup, not a chatbot.

Primary states:

- Not signed in: prompt to connect to Mirko.
- Ready: show "Track this job."
- Extracting: show progress while reading the page.
- Review: editable fields and skill chips.
- Weak extraction: ask the user to select the job description.
- Saved: show confirmation and a link to the tracker.
- Error: show retry and manual paste options.

Review fields:

- Role name input
- Company input
- Location input
- Job description textarea
- Primary skills chips
- Secondary skills chips
- Emerging/unmapped skill chips
- Save to tracker button

Skill chips should support:

- Add via autocomplete
- Remove
- Move between primary and secondary
- Preserve unmapped user additions as emerging skill candidates

## Skill Data Model

Mirko needs two separate skill tracks.

### Canonical Skills

Canonical skills are mapped to the existing Lightcast-backed `skills` table. These are saved into:

- `jobs.main_skills`
- `jobs.side_skills`

Canonical skills power:

- Job matching
- Skill overlap scoring
- Skill gap calculations
- Existing market analytics that depend on trusted taxonomy keys

### Emerging Skill Candidates

Unmapped skills should not be placed directly into `jobs.main_skills` or `jobs.side_skills`, because that would weaken scoring consistency. They also must not be thrown into unstructured JSON and forgotten.

Instead, store them as first-class market signals in a new table.

Proposed table:

```sql
CREATE TABLE job_skill_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  user_id             UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  raw_label           TEXT NOT NULL,
  normalized_label    TEXT NOT NULL,
  skill_type          VARCHAR(20) NOT NULL CHECK (skill_type IN ('primary', 'secondary')),
  source              VARCHAR(30) NOT NULL CHECK (source IN ('user_added', 'llm_suggested', 'page_extracted')),
  source_platform     VARCHAR(80),
  confidence          DECIMAL(3,2) CHECK (confidence BETWEEN 0 AND 1),
  occurrence_count    INTEGER NOT NULL DEFAULT 1,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapped_skill_id     INTEGER REFERENCES skills(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'unmapped'
                      CHECK (status IN ('unmapped', 'mapped', 'rejected', 'promoted_custom')),
  UNIQUE(job_id, normalized_label, skill_type)
);
```

This enables Mirko to track:

- Emerging tools and frameworks
- Skills missing from the current taxonomy
- Industry-specific demand not captured by Lightcast
- Frequency by industry, company, location, source platform, and time

Examples:

- LangGraph
- CrewAI
- RAGAS
- Cursor
- MCP
- Vercel AI SDK

## Emerging Skill Lifecycle

1. User or backend suggestion adds an unmapped skill.
2. Backend normalizes the label.
3. Backend saves or increments a `job_skill_candidates` row.
4. Analytics groups similar labels into demand signals.
5. Review job attempts to map candidates to existing Lightcast skills.
6. If no equivalent exists and demand is real, promote the candidate into a Mirko custom taxonomy.

Future custom taxonomy fields can be added to `skills`, such as:

- `taxonomy_source`: `lightcast` or `mirko_custom`
- `canonical_status`: `active`, `candidate`, `deprecated`

Until promoted, emerging candidates should be visible in market intelligence but excluded from scoring arrays.

## Backend API Design

### `POST /jobs/import/preview`

Purpose: Generate editable job preview and suggested skills before save.

Input:

```json
{
  "source_url": "https://example.com/job/123",
  "source_platform": "workday",
  "role_name": "Senior Data Engineer",
  "company_name": "ExampleCo",
  "location": "Bengaluru, India",
  "job_description": "Full job description text...",
  "page_title": "Senior Data Engineer - ExampleCo",
  "capture_method": "known_portal"
}
```

Output:

```json
{
  "role_name": "Senior Data Engineer",
  "company_name": "ExampleCo",
  "location": "Bengaluru, India",
  "job_description": "Full job description text...",
  "primary_skills": [
    { "label": "Python (Programming Language)", "taxonomy_key": "Python (Programming Language)", "confidence": 0.92 }
  ],
  "secondary_skills": [
    { "label": "Apache Spark", "taxonomy_key": "Apache Spark", "confidence": 0.83 }
  ],
  "emerging_skills": [
    { "label": "LangGraph", "normalized_label": "langgraph", "skill_type": "secondary", "confidence": 0.78 }
  ],
  "warnings": []
}
```

### `POST /jobs/import`

Purpose: Persist the user-confirmed job.

Input:

```json
{
  "source_url": "https://example.com/job/123",
  "source_platform": "workday",
  "role_name": "Senior Data Engineer",
  "company_name": "ExampleCo",
  "location": "Bengaluru, India",
  "job_description": "Full job description text...",
  "primary_skills": ["Python (Programming Language)"],
  "secondary_skills": ["Apache Spark"],
  "emerging_skills": [
    { "label": "LangGraph", "skill_type": "secondary", "source": "user_added" }
  ],
  "capture_method": "known_portal"
}
```

Backend behavior:

- Validate auth.
- Validate role and description are present.
- Validate canonical skills against `skills.taxonomy_key`.
- Normalize emerging skill labels.
- Generate stable `job_id`.
- Deduplicate by source URL or normalized role/company/location.
- Upsert into `jobs`.
- Upsert emerging skill candidates.
- Upsert `job_applications` with status `pending`.
- Return the saved tracker item.

The save endpoint should not run a second independent tagger pass. It should validate and persist the user-confirmed payload.

## Database Changes

Add metadata columns to `jobs`:

```sql
ALTER TABLE jobs
  ADD COLUMN ingestion_source VARCHAR(30) NOT NULL DEFAULT 'scraper',
  ADD COLUMN source_platform VARCHAR(80),
  ADD COLUMN quality_status VARCHAR(30) NOT NULL DEFAULT 'auto_extracted',
  ADD COLUMN created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN source_url TEXT;
```

Notes:

- Existing `apply_url` remains the job application URL used by the app.
- `source_url` records the page captured by the extension.
- `ingestion_source = 'extension'` identifies user-saved jobs.
- `quality_status = 'user_confirmed'` marks reviewed extension captures.
- Analytics can choose whether to include scraper-only jobs, extension jobs, or both.

Add `job_skill_candidates` for emerging demand tracking.

Add indexes:

```sql
CREATE INDEX idx_jobs_ingestion_source ON jobs(ingestion_source);
CREATE INDEX idx_jobs_source_platform ON jobs(source_platform);
CREATE INDEX idx_jobs_created_by_user ON jobs(created_by_user_id);
CREATE INDEX idx_job_skill_candidates_label ON job_skill_candidates(normalized_label);
CREATE INDEX idx_job_skill_candidates_status ON job_skill_candidates(status);
CREATE INDEX idx_job_skill_candidates_job ON job_skill_candidates(job_id);
```

## Portal Adapter Strategy

Use `KNOWN_PORTALS.md` as the source for known ATS families.

Initial adapter priority:

1. Workday
2. Greenhouse
3. Lever
4. SmartRecruiters
5. LinkedIn visible page capture
6. Naukri visible page capture
7. Generic JSON-LD `JobPosting`
8. Generic selected text/manual paste

Adapters should return a normalized draft:

```ts
type CapturedJobDraft = {
  roleName: string | null
  companyName: string | null
  location: string | null
  jobDescription: string | null
  sourceUrl: string
  sourcePlatform: string
  captureMethod: "known_portal" | "json_ld" | "selected_text" | "visible_page" | "manual_paste"
  confidence: number
}
```

Known portal adapters improve extraction quality, but the universal fallback is what makes Mirko useful on any page.

## Data Quality Rules

- Do not save without explicit user confirmation.
- Do not overwrite user-confirmed canonical skills with backend retagging.
- Do not save unmapped labels into canonical skill arrays.
- Do save unmapped labels as structured emerging skill candidates.
- Do dedupe extension jobs before inserting.
- Do store source and quality metadata.
- Do keep extension-captured jobs available in tracker immediately.
- Do let analytics separate verified market feeds from user-confirmed extension captures.

## Testing Strategy

Backend tests:

- Preview returns canonical and emerging skill suggestions.
- Save validates canonical skill keys.
- Save persists `jobs` and `job_applications`.
- Save persists emerging skill candidates.
- Duplicate source URL updates existing job and tracker row.
- Unmapped skills do not enter `jobs.main_skills` or `jobs.side_skills`.

Extension tests:

- Captures selected text.
- Captures JSON-LD `JobPosting`.
- Captures known portal drafts.
- Shows weak extraction fallback.
- Lets users edit fields and skill chips.
- Sends confirmed payload to backend.

Manual browser checks:

- Workday job page
- Greenhouse job page
- Lever job page
- LinkedIn job page
- Naukri job page
- Generic company career page with selected text fallback

## MVP Implementation Decisions

- Use a popup for the first extension UI, designed so it can move to a side panel later without changing the backend contract.
- Reuse existing backend auth through a web handoff: the user connects Mirko from the extension, signs in through the web app, and the extension stores a token in Chrome extension storage.
- Start with `job_skill_candidates` as the structured event table for emerging skills. Add a global `emerging_skills` rollup table only after real usage shows the grouping and review needs.
- Keep known portal adapters local to the extension for the first version. Do not call ATS APIs from the extension; the extension captures the current page the user is viewing.

## Approval Summary

Approved product direction:

- Universal extension first, site-specific adapters second, chatbot later.
- User-confirmed review flow before save.
- Backend preview suggests skills.
- Backend save validates and persists confirmed skills.
- Every extension-saved job goes into Supabase `jobs`.
- Emerging/unmapped skills become first-class market demand signals.
