# Mirko Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Mirko Chrome extension as a universal "Track this job" capture tool that saves confirmed jobs into the existing tracker.

**Architecture:** Add backend preview/import contracts to FastAPI, with a focused job-import service that validates canonical skills and stores emerging skill candidates separately. Add a standalone Manifest V3 extension package under `extension/` with page extraction modules, a compact popup UI, and API/storage helpers. Keep the extension thin: it captures visible page context, asks the backend for suggestions, lets the user edit, and saves the confirmed payload.

**Tech Stack:** FastAPI, Supabase client, pytest, Chrome Manifest V3, dependency-free ES modules, Node's built-in test runner, plain HTML/CSS using Truth Mirror design tokens.

---

## File Structure

- Create `backend/app/services/job_importer.py`: normalize labels, generate stable extension job IDs, suggest canonical/emerging skills, persist confirmed imports.
- Modify `backend/app/schemas/jobs.py`: add import request/response schemas and skill suggestion schemas.
- Modify `backend/app/routers/jobs.py`: add `POST /jobs/import/preview` and `POST /jobs/import`.
- Create `database/migrations/20260424_mirko_extension_imports.sql`: add job metadata columns and `job_skill_candidates`.
- Create `backend/tests/test_job_importer.py`: unit tests for normalization, ID generation, canonical validation, and emerging skill persistence behavior.
- Create `backend/tests/test_jobs_import.py`: API tests for preview/save route behavior with mocked Supabase.
- Create `extension/package.json`, `extension/scripts/build.mjs`: dependency-free extension build tooling.
- Create `extension/public/manifest.json`, `extension/public/popup.html`, `extension/public/options.html`: Manifest V3 and static HTML shells.
- Create `extension/src/types.js`: shared extension-side JSDoc typedefs.
- Create `extension/src/extractors.js`: selected-text, JSON-LD, known portal, and visible-page extraction.
- Create `extension/src/api.js`: backend preview/save client.
- Create `extension/src/storage.js`: extension token/API URL helpers.
- Create `extension/src/popup.js`: popup state machine and DOM event wiring.
- Create `extension/src/options.js`: options page for API URL/token.
- Create `extension/src/styles.css`: compact Mirko panel styling using existing brand tokens.
- Create `extension/tests/extractors.test.mjs`: Node tests for extraction logic using small document doubles.
- Modify root or docs only if needed to document extension commands.

## Task 1: Backend Import Service

**Files:**
- Create: `backend/app/services/job_importer.py`
- Test: `backend/tests/test_job_importer.py`

- [ ] **Step 1: Write failing service tests**

```python
from app.services.job_importer import (
    build_extension_job_id,
    normalize_skill_label,
    split_confirmed_skills,
)

def test_normalize_skill_label_collapses_case_punctuation_and_spaces() -> None:
    assert normalize_skill_label("  Lang Graph!! ") == "lang graph"

def test_build_extension_job_id_prefers_source_url() -> None:
    first = build_extension_job_id("https://jobs.example.com/role/123", "Role", "Co", "India")
    second = build_extension_job_id("https://jobs.example.com/role/123", "Other", "Else", "Remote")
    assert first == second
    assert first.startswith("ext_")

def test_split_confirmed_skills_keeps_canonical_and_returns_emerging() -> None:
    canonical, emerging = split_confirmed_skills(
        ["Python (Programming Language)", "LangGraph"],
        valid_taxonomy_keys={"Python (Programming Language)"},
        skill_type="primary",
    )
    assert canonical == ["Python (Programming Language)"]
    assert emerging == [{"label": "LangGraph", "skill_type": "primary", "source": "user_added"}]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_job_importer.py -q`

Expected: FAIL because `app.services.job_importer` does not exist.

- [ ] **Step 3: Implement the service**

Create `backend/app/services/job_importer.py` with:

```python
from __future__ import annotations

import hashlib
import re
from datetime import date
from typing import Any

from supabase import Client

from app.services.taxonomy_loader import get_all_skills, lookup_by_name

_NON_WORD = re.compile(r"[^a-z0-9+#. ]+")
_SPACE = re.compile(r"\s+")

def normalize_skill_label(label: str) -> str:
    cleaned = _NON_WORD.sub(" ", label.strip().lower())
    return _SPACE.sub(" ", cleaned).strip()

def build_extension_job_id(source_url: str | None, role_name: str, company_name: str | None, location: str | None) -> str:
    source = (source_url or "").strip().lower()
    if not source:
        source = "|".join([(role_name or "").strip().lower(), (company_name or "").strip().lower(), (location or "").strip().lower()])
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:20]
    return f"ext_{digest}"

def split_confirmed_skills(skills: list[str], valid_taxonomy_keys: set[str], skill_type: str) -> tuple[list[str], list[dict[str, str]]]:
    canonical: list[str] = []
    emerging: list[dict[str, str]] = []
    seen_canonical: set[str] = set()
    seen_emerging: set[str] = set()
    for raw in skills:
        label = raw.strip()
        if not label:
            continue
        if label in valid_taxonomy_keys and label not in seen_canonical:
            canonical.append(label)
            seen_canonical.add(label)
            continue
        normalized = normalize_skill_label(label)
        if normalized and normalized not in seen_emerging:
            emerging.append({"label": label, "skill_type": skill_type, "source": "user_added"})
            seen_emerging.add(normalized)
    return canonical, emerging
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_job_importer.py -q`

Expected: PASS.

## Task 2: Backend Schemas And Routes

**Files:**
- Modify: `backend/app/schemas/jobs.py`
- Modify: `backend/app/routers/jobs.py`
- Test: `backend/tests/test_jobs_import.py`

- [ ] **Step 1: Write failing API tests**

```python
from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers import jobs

def test_import_preview_requires_description(monkeypatch) -> None:
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/import/preview", json={"role_name": "Role", "job_description": ""})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422

def test_import_job_calls_service_and_returns_application(monkeypatch) -> None:
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    monkeypatch.setattr(jobs, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(jobs.job_importer, "save_imported_job", lambda db, user_id, body: {
        "id": 1,
        "job_id": "ext_abc",
        "title": "Data Engineer",
        "company": "Acme",
        "job_description": "Build data products with Python.",
        "status": "pending",
        "applied_at": None,
        "response_at": None,
        "checkin_sent_at": None,
        "notes": None,
        "created_at": "2026-04-24T00:00:00+00:00",
    })
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/import", json={
                "source_url": "https://example.com/job",
                "source_platform": "generic",
                "role_name": "Data Engineer",
                "company_name": "Acme",
                "location": "India",
                "job_description": "Build data products with Python.",
                "primary_skills": ["Python (Programming Language)"],
                "secondary_skills": [],
                "emerging_skills": [],
                "capture_method": "visible_page",
            })
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["job_id"] == "ext_abc"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_jobs_import.py -q`

Expected: FAIL because schemas/routes do not exist.

- [ ] **Step 3: Add schemas**

Add to `backend/app/schemas/jobs.py`:

```python
class SkillSuggestion(BaseModel):
    label: str
    taxonomy_key: str | None = None
    normalized_label: str | None = None
    skill_type: str | None = None
    confidence: float = 0.0

class EmergingSkillInput(BaseModel):
    label: str
    skill_type: str
    source: str = "user_added"

class JobImportPreviewRequest(BaseModel):
    source_url: str | None = None
    source_platform: str | None = None
    role_name: str
    company_name: str | None = None
    location: str | None = None
    job_description: str
    page_title: str | None = None
    capture_method: str = "visible_page"

class JobImportPreviewResponse(BaseModel):
    role_name: str
    company_name: str | None = None
    location: str | None = None
    job_description: str
    primary_skills: list[SkillSuggestion]
    secondary_skills: list[SkillSuggestion]
    emerging_skills: list[SkillSuggestion]
    warnings: list[str] = []

class JobImportRequest(BaseModel):
    source_url: str | None = None
    source_platform: str | None = None
    role_name: str
    company_name: str | None = None
    location: str | None = None
    job_description: str
    primary_skills: list[str] = []
    secondary_skills: list[str] = []
    emerging_skills: list[EmergingSkillInput] = []
    capture_method: str = "visible_page"
```

- [ ] **Step 4: Add routes**

Modify `backend/app/routers/jobs.py` to import schemas and `job_importer`, then add:

```python
@router.post("/import/preview", response_model=JobImportPreviewResponse)
async def preview_job_import(body: JobImportPreviewRequest, current_user: dict = Depends(get_current_user)) -> JobImportPreviewResponse:
    if not body.job_description.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Job description is required.")
    db = get_supabase_admin()
    return job_importer.preview_imported_job(db, body)

@router.post("/import", response_model=ApplicationResponse)
async def import_job(body: JobImportRequest, current_user: dict = Depends(get_current_user)) -> ApplicationResponse:
    if not body.role_name.strip() or not body.job_description.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Role name and job description are required.")
    db = get_supabase_admin()
    saved = job_importer.save_imported_job(db, current_user["user_id"], body)
    return ApplicationResponse(**saved)
```

- [ ] **Step 5: Run route tests**

Run: `cd backend && pytest tests/test_jobs_import.py -q`

Expected: PASS.

## Task 3: Database Migration

**Files:**
- Create: `database/migrations/20260424_mirko_extension_imports.sql`

- [ ] **Step 1: Add migration**

Create migration with:

```sql
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS ingestion_source VARCHAR(30) NOT NULL DEFAULT 'scraper',
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(80),
  ADD COLUMN IF NOT EXISTS quality_status VARCHAR(30) NOT NULL DEFAULT 'auto_extracted',
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE TABLE IF NOT EXISTS job_skill_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  raw_label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  skill_type VARCHAR(20) NOT NULL CHECK (skill_type IN ('primary', 'secondary')),
  source VARCHAR(30) NOT NULL CHECK (source IN ('user_added', 'llm_suggested', 'page_extracted')),
  source_platform VARCHAR(80),
  confidence DECIMAL(3,2) CHECK (confidence BETWEEN 0 AND 1),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapped_skill_id INTEGER REFERENCES skills(id),
  status VARCHAR(30) NOT NULL DEFAULT 'unmapped' CHECK (status IN ('unmapped', 'mapped', 'rejected', 'promoted_custom')),
  UNIQUE(job_id, normalized_label, skill_type)
);

CREATE INDEX IF NOT EXISTS idx_jobs_ingestion_source ON jobs(ingestion_source);
CREATE INDEX IF NOT EXISTS idx_jobs_source_platform ON jobs(source_platform);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by_user ON jobs(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_job_skill_candidates_label ON job_skill_candidates(normalized_label);
CREATE INDEX IF NOT EXISTS idx_job_skill_candidates_status ON job_skill_candidates(status);
CREATE INDEX IF NOT EXISTS idx_job_skill_candidates_job ON job_skill_candidates(job_id);
```

- [ ] **Step 2: Verify migration text**

Run: `rg -n "job_skill_candidates|ingestion_source|source_platform" database/migrations/20260424_mirko_extension_imports.sql`

Expected: all new objects appear.

## Task 4: Extension Extractors

**Files:**
- Create: `extension/package.json`
- Create: `extension/src/types.js`
- Create: `extension/src/extractors.js`
- Test: `extension/tests/extractors.test.mjs`

- [ ] **Step 1: Write failing extractor tests**

```ts
import { strict as assert } from "node:assert"
import test from "node:test"
import { extractFromDocument } from "../src/extractors.js"

test("extracts JSON-LD JobPosting", () => {
  const doc = makeDocument({
    title: "Data Engineer - Acme",
    scripts: ['{"@type":"JobPosting","title":"Data Engineer","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"Bengaluru","addressCountry":"IN"}},"description":"Build pipelines with Python and SQL."}'],
  })
  const draft = extractFromDocument(doc, "https://example.com/job", "")
  assert.equal(draft.roleName, "Data Engineer")
  assert.equal(draft.companyName, "Acme")
  assert.equal(draft.captureMethod, "json_ld")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && npm test`

Expected: FAIL because extension package does not exist.

- [ ] **Step 3: Implement extractor package and code**

Use Manifest V3-compatible browser APIs and pure DOM parsing. Extract selected text first, JSON-LD second, known selectors third, and visible page text last.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extension && npm test`

Expected: PASS.

## Task 5: Extension Popup Workflow

**Files:**
- Create: `extension/public/manifest.json`
- Create: `extension/public/popup.html`
- Create: `extension/public/options.html`
- Create: `extension/src/api.js`
- Create: `extension/src/storage.js`
- Create: `extension/src/popup.js`
- Create: `extension/src/options.js`
- Create: `extension/src/styles.css`
- Create: `extension/scripts/build.mjs`

- [ ] **Step 1: Implement build shell**

Use `extension/scripts/build.mjs` to copy public files, ES modules, and CSS into `extension/dist`.

- [ ] **Step 2: Implement popup states**

States: `idle`, `extracting`, `review`, `weak`, `saving`, `saved`, `error`.

- [ ] **Step 3: Implement editable review fields**

Fields: role, company, location, description, primary skills, secondary skills, emerging skills.

- [ ] **Step 4: Implement API calls**

`previewImport()` calls `POST /jobs/import/preview`; `saveImport()` calls `POST /jobs/import`.

- [ ] **Step 5: Build extension**

Run: `cd extension && npm run build`

Expected: `dist/manifest.json`, `dist/popup.html`, `dist/popup.js`, `dist/styles.css`.

## Task 6: Verification

**Files:**
- Modify: `README.md` or create `extension/README.md`

- [ ] **Step 1: Run backend tests**

Run: `cd backend && pytest tests/test_job_importer.py tests/test_jobs_import.py tests/test_jobs_applications.py -q`

Expected: PASS.

- [ ] **Step 2: Run extension tests and build**

Run: `cd extension && npm test && npm run build`

Expected: PASS and build output present.

- [ ] **Step 3: Browser visual check**

Open `extension/dist/popup.html` in a browser-sized popup viewport. Verify:

- The panel fits in a 380px-wide extension popup.
- Text does not overlap.
- Buttons and chips are keyboard focusable.
- The core review workflow can be clicked through with mocked/local state or a configured backend.

- [ ] **Step 4: Commit**

Run:

```bash
git add backend/app/services/job_importer.py backend/app/schemas/jobs.py backend/app/routers/jobs.py backend/tests/test_job_importer.py backend/tests/test_jobs_import.py database/migrations/20260424_mirko_extension_imports.sql extension docs/superpowers/plans/2026-04-24-mirko-extension-implementation.md
git commit -m "Build Mirko job tracker extension MVP"
```

## Self-Review

Spec coverage:

- Universal extension capture: Task 4 and Task 5.
- Known portal adapters and selected-text fallback: Task 4.
- User-confirmed skill review: Task 5.
- Backend preview/save split: Task 2.
- Supabase `jobs` persistence: Task 1 and Task 2.
- Emerging skills as first-class demand signals: Task 1 and Task 3.
- Verification: Task 6.

Placeholder scan: no unresolved placeholders remain.

Type consistency:

- Backend uses snake_case Pydantic fields matching API contracts.
- Extension uses camelCase internal draft fields and maps to snake_case API payloads in `extension/src/api.js`.
