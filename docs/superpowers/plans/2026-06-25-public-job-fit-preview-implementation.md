# Public Job Fit Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the preview-first `/intel` job-fit journey so anonymous users can upload a CV for one role, see evidence-based fit, and authenticated users can save and tailor the same role.

**Architecture:** Add a stateless public backend endpoint that reuses the anonymous CV parser and deterministic job overlap math without writing user rows. Add a small frontend intent helper/API wrapper, then wire a focused role-fit drawer into the existing public Intel split pane. Authenticated users reuse `/jobs/fit-batch`; anonymous users call the new public preview endpoint.

**Tech Stack:** FastAPI, Pydantic, Supabase repository helpers, Next.js 14, React, TanStack Query, strict TypeScript, existing CSS modules/global CSS.

---

### Task 1: Backend Stateless Public Fit Preview

**Files:**
- Modify: `backend/app/routers/public.py`
- Test: `backend/tests/test_public_score_cv.py`

- [x] **Step 1: Write the failing endpoint test**

Add a test that posts a PDF to `/public/jobs/j1/fit-preview`, stubs CV parsing and job skill rows, and asserts a role-specific fit response.

```python
def test_job_fit_preview_computes_role_specific_fit(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}])

    class _Repo:
        def get_job_skills(self, job_id: str) -> dict:
            assert job_id == "j1"
            return {
                "job_id": "j1",
                "job_title": "Data Analyst",
                "company_name": "Acme",
                "skills": [
                    {"taxonomy_key": "python", "is_primary": True, "required_level": 2},
                    {"taxonomy_key": "rust", "is_primary": True, "required_level": 2},
                    {"taxonomy_key": "sql", "is_primary": False, "required_level": 2},
                ],
            }

    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: _Repo())
    monkeypatch.setattr(public_router, "build_skill_level_map", lambda s: {"python": 3, "sql": 1})

    res = TestClient(app).post("/public/jobs/j1/fit-preview", files=_pdf_upload())

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["job_id"] == "j1"
    assert body["title"] == "Data Analyst"
    assert body["company"] == "Acme"
    assert body["fit_pct"] == 60.0
    assert body["matched_count"] == 2
    assert body["total_skills"] == 3
    assert body["matched_skills"] == ["python", "sql"]
    assert body["missing_skills"] == ["rust"]
    assert body["cv_preview"]["score"] == 72
```

- [x] **Step 2: Verify the test fails**

Run:

```bash
source .venv/bin/activate
pytest backend/tests/test_public_score_cv.py::test_job_fit_preview_computes_role_specific_fit -q
```

Expected: FAIL with 404 because the endpoint does not exist yet.

- [x] **Step 3: Implement the endpoint**

In `backend/app/routers/public.py`, add:

```python
class PublicJobFitPreviewResponse(BaseModel):
    job_id: str
    title: str
    company: str | None
    fit_pct: float
    matched_count: int
    total_skills: int
    matched_skills: list[str]
    missing_skills: list[str]
    cv_preview: AnonScoreResponse
```

Extract a shared anonymous CV scoring helper from `score_cv_preview`, then add:

```python
@router.post("/jobs/{job_id}/fit-preview", response_model=PublicJobFitPreviewResponse)
async def job_fit_preview(...):
    parsed, score_preview = await _score_anon_cv(...)
    level_map = build_skill_level_map(parsed.get("skills_detected", []))
    job = get_public_jobs_repository().get_job_skills(job_id)
    if not job or not job.get("skills"):
        raise HTTPException(status_code=404, detail="Job not found or has no skills")
    fit = _compute_public_fit(job["skills"], level_map)
    return PublicJobFitPreviewResponse(...)
```

The helper must reuse the same validation, Turnstile, rate limit, file parsing, and score projection as `/public/score-cv`.

- [x] **Step 4: Add edge tests**

Add tests for missing taxonomy rows and unsupported file type:

```python
def test_job_fit_preview_unknown_when_job_has_no_skills(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}])
    class _Repo:
        def get_job_skills(self, job_id: str) -> dict:
            return {"job_id": job_id, "job_title": "Role", "company_name": "Acme", "skills": []}
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: _Repo())
    res = TestClient(app).post("/public/jobs/j1/fit-preview", files=_pdf_upload())
    assert res.status_code == 404

def test_job_fit_preview_rejects_wrong_file_type(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}])
    res = TestClient(app).post("/public/jobs/j1/fit-preview", files={"file": ("cv.txt", b"hello", "text/plain")})
    assert res.status_code == 422
```

- [x] **Step 5: Verify backend tests pass**

Run:

```bash
source .venv/bin/activate
pytest backend/tests/test_public_score_cv.py backend/tests/test_fit_batch_router.py -q
```

Expected: PASS.

### Task 2: Frontend Intent Helper And API Contract

**Files:**
- Create: `frontend/lib/job-fit-intent.ts`
- Modify: `frontend/lib/api.ts`
- Test: `frontend/tests/job-fit-intent.test.ts`

- [x] **Step 1: Write failing helper/API tests**

Create `frontend/tests/job-fit-intent.test.ts`:

```typescript
import test from "node:test"
import assert from "node:assert/strict"
import { jobFitNextPath, fitBand } from "../lib/job-fit-intent"

test("jobFitNextPath preserves job context for upload and tailoring", () => {
  assert.equal(jobFitNextPath({ jobId: "j 1", hasReplayableCv: true }), "/cv?jobId=j+1")
  assert.equal(jobFitNextPath({ jobId: "j 1", hasReplayableCv: false }), "/cv?upload=1&jobId=j+1")
})

test("jobFitNextPath falls back safely without a job id", () => {
  assert.equal(jobFitNextPath({ jobId: "", hasReplayableCv: false }), "/cv?upload=1")
})

test("fitBand mirrors the intel fit scale", () => {
  assert.equal(fitBand(70), "strong")
  assert.equal(fitBand(40), "building")
  assert.equal(fitBand(39), "gap")
})
```

- [x] **Step 2: Verify helper tests fail**

Run:

```bash
cd frontend
npx tsx --test tests/job-fit-intent.test.ts
```

Expected: FAIL because `frontend/lib/job-fit-intent.ts` does not exist.

- [x] **Step 3: Implement helper and API wrapper**

Create `frontend/lib/job-fit-intent.ts`:

```typescript
export type FitBand = "strong" | "building" | "gap"

export function fitBand(score: number): FitBand {
  if (score >= 70) return "strong"
  if (score >= 40) return "building"
  return "gap"
}

export function jobFitNextPath(input: { jobId: string | null | undefined; hasReplayableCv: boolean }): string {
  const id = (input.jobId ?? "").trim()
  if (!id) return "/cv?upload=1"
  const params = new URLSearchParams()
  if (!input.hasReplayableCv) params.set("upload", "1")
  params.set("jobId", id)
  return `/cv?${params.toString()}`
}
```

In `frontend/lib/api.ts`, add `PublicJobFitPreviewResponse` and `publicCv.jobFitPreview(file, jobId)`.

- [x] **Step 4: Verify helper tests pass**

Run:

```bash
cd frontend
npx tsx --test tests/job-fit-intent.test.ts
```

Expected: PASS.

### Task 3: Intel Fit Drawer UI

**Files:**
- Create: `frontend/components/public/intel/job-fit-drawer.tsx`
- Modify: `frontend/components/public/intel/intel-results.tsx`
- Modify: `frontend/components/public/intel/intel-rows.tsx`
- Modify: `frontend/components/public/intel-pane.css`

- [x] **Step 1: Write a static contract test**

Create or extend `frontend/tests/layout-intel-contract.test.mjs` with checks that:

```javascript
assert.ok(source.includes("JobFitDrawer"))
assert.ok(source.includes("onCheckFit"))
assert.ok(drawerSource.includes("Save + tailor CV"))
assert.ok(drawerSource.includes("public_fit_preview"))
```

- [x] **Step 2: Verify the contract test fails**

Run:

```bash
cd frontend
node --test tests/layout-intel-contract.test.mjs
```

Expected: FAIL because no drawer exists.

- [x] **Step 3: Implement the drawer**

Create a client component that supports:

- anonymous upload via `publicCv.jobFitPreview`;
- authenticated existing fit display from `JobRowFit`;
- no-CV upload handoff through `jobFitNextPath`;
- `Save + tailor CV` through `jobs.saveJob(token, job.id)` then `router.push("/cv?jobId=...")`;
- Escape and close button.

- [x] **Step 4: Wire results and rows**

Pass `onCheckFit(job)` from `IntelResults` to `JobRow`. Replace the old logged-out signup gate inside `FitSlot` with a button that opens the drawer.

- [x] **Step 5: Verify frontend contract tests pass**

Run:

```bash
cd frontend
node --test tests/layout-intel-contract.test.mjs
npx tsx --test tests/job-fit-intent.test.ts
```

Expected: PASS.

### Task 4: Integration Verification And Push

**Files:**
- Modify: `AGENTS.md`
- Possibly modify: `docs/superpowers/plans/2026-06-25-public-job-fit-preview-implementation.md`

- [x] **Step 1: Run focused backend and frontend tests**

Run:

```bash
source .venv/bin/activate
pytest backend/tests/test_public_score_cv.py backend/tests/test_fit_batch_router.py -q
cd frontend && npx tsx --test tests/job-fit-intent.test.ts && node --test tests/layout-intel-contract.test.mjs
```

- [x] **Step 2: Run required project gates**

Run:

```bash
source .venv/bin/activate
pytest backend/tests
cd frontend && npx tsc --noEmit && npm run lint
git diff --check
```

- [x] **Step 3: Update session summary**

Move the previous `LAST SESSION SUMMARY` down and add a new summary covering implementation, validation, and push status.

- [x] **Step 4: Commit and push**

Run:

```bash
git add AGENTS.md backend/app/routers/public.py backend/tests/test_public_score_cv.py frontend/lib/api.ts frontend/lib/job-fit-intent.ts frontend/tests/job-fit-intent.test.ts frontend/components/public/intel/job-fit-drawer.tsx frontend/components/public/intel/intel-results.tsx frontend/components/public/intel/intel-rows.tsx frontend/components/public/intel-pane.css frontend/tests/layout-intel-contract.test.mjs docs/superpowers/plans/2026-06-25-public-job-fit-preview-implementation.md
git commit -m "feat: add public job fit preview"
git push origin Develop
```

Expected: push succeeds and `Develop` contains the docs commit plus implementation commit.
