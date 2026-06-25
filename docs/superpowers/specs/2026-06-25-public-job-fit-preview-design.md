# Public Job Fit Preview

- **Date:** 2026-06-25
- **Status:** Approved design
- **Primary route:** `/intel`
- **Downstream routes:** `/cv-preview`, `/signup`, `/cv?upload=1`,
  `/cv?jobId={job_id}`, `/market`
- **North star:** A public role-row fit action answers "how do I fit this
  specific job?" before it asks for commitment.

## Purpose

Mature the public `fit - sign in` action on the Live Career Intel page. Today it
is a useful visual hook, but the click path is account-first and generic. The
user intent is specific: "tell me whether my CV fits this role." The product
should preserve that role intent through authentication, CV upload, saving, and
tailoring.

The approved direction is **preview first**:

```text
role -> CV evidence -> fit preview -> save role -> tailor CV
```

## Current Production Reality

The existing codebase already has most of the required product pieces:

1. `/intel` renders public company and role rows in
   `frontend/components/public/intel/*`.
2. Logged-out role fit buttons currently open the signup gate in login mode with
   source `intel_fit_lock`, but they do not carry a `next` path or `job_id`.
3. The bottom locked CTA sends users to `/signup?next=/cv?upload=1`, which is
   useful but generic.
4. Logged-in users with a CV already get deterministic role fit through
   `POST /jobs/fit-batch`.
5. Logged-in users without a CV get the honest no-fit state and a page-level CV
   upload CTA.
6. The landing and `/cv-preview` already support anonymous CV scoring and
   save-on-signup replay.
7. The authenticated app already supports saving jobs, job-specific readiness,
   Forge gap practice, and tailoring at `/cv?jobId={job_id}`.

There is one important gap: a true logged-out one-job fit preview is not wired
today. `POST /jobs/fit-batch` reads the authenticated user's stored
`user_skills`. The anonymous CV scorer returns score/domain output but not a
job-fit-ready skill map. So v1 needs one small bridge:

```text
anonymous CV parse + job skill rows + existing overlap math -> stateless fit preview
```

That bridge can be implemented as a public, rate-limited endpoint or as an
extension to the anonymous CV preview contract. It must not persist the CV or
create user skill rows.

## Product Contract

The role-row action means:

> Check my fit for this exact role.

It does not mean:

- generic signup;
- a global career verdict;
- an ATS pass score;
- an employer-side prediction;
- an apply flow with source URL unless the role detail data is explicitly loaded.

The output is evidence-based skill fit: fit percentage, matched skill count, and
top missing skills.

## Logged-Out Journey

1. The user clicks `fit` on a specific role row.
2. Myro opens a focused fit drawer for that role, preserving `job_id`,
   company, title, location, and visible role metadata.
3. The drawer asks for a CV only when needed. It should feel like the next step
   in checking fit, not a signup wall.
4. The user uploads a PDF or DOCX. Myro uses the anonymous CV scoring path:
   compute-only, browser-stashed, no account persistence.
5. Myro shows a one-role fit preview:
   - fit percentage;
   - matched skills, such as `5/8`;
   - top missing skills;
   - a clear next action.
6. The primary CTA is `Save this role + tailor CV`.
7. Signup/login receives a same-origin `next` that preserves the job context,
   preferably `/cv?jobId={job_id}` when the CV can be replayed, or
   `/cv?upload=1&jobId={job_id}` when the user must re-upload.
8. After authentication, Myro replays the CV where possible, saves or prompts to
   save the role, and lands in the tailoring flow for that exact job.

If the anonymous file cannot be replayed after OAuth, the saved preview result
can still maintain continuity, but the user may need to upload again. The UI
should state this as a normal file handoff, not as data loss.

## Logged-In Journey With CV

1. `/intel` continues to lazy-load fit only for visible open roles through
   `POST /jobs/fit-batch`.
2. Role rows show the real fit pill inline.
3. Clicking the fit pill opens the same role fit drawer, already populated.
4. The drawer shows:
   - role title, company, location, and source freshness;
   - fit percentage;
   - matched count and top matched skills;
   - top missing skills;
   - an evidence-based next move.
5. The primary CTA is `Save + tailor CV`.
6. The action saves the job through the existing save endpoint, then routes to
   `/cv?jobId={job_id}`.
7. Secondary actions may link missing skills to Forge and allow opening the
   role in Market or the public company page.

The fit number remains deterministic and free. XP-gated deepeners can stay
downstream in authenticated job analysis, not in the public preview drawer.

## Logged-In Journey Without CV

1. The user clicks a role fit action.
2. Myro opens the same drawer, but in upload-first state.
3. The copy and visual state explain only the non-visible constraint: a CV is
   required to compute fit.
4. The upload destination preserves `job_id`.
5. After upload and score recompute, Myro returns the user to the same job fit
   drawer or directly to `/cv?jobId={job_id}`.

Do not show row-by-row nags. The drawer owns this moment.

## UI Shape

Use one focused drawer or sheet, not a full new page in v1.

Suggested structure:

1. Header: role title, company, location, mode, indexed freshness.
2. Fit readout:
   - percentage with band color;
   - progress bar;
   - matched count, such as `5 of 8 listed skills`.
3. Evidence chips:
   - `You have`;
   - `To close`.
4. Actions:
   - primary: `Save + tailor CV`;
   - secondary: `Practice missing skill` or `Open role`.

Keep copy sparse. Visual state should do most of the work. The drawer should not
repeat obvious states like disabled, error, loading, or locked unless the user
needs a non-visible constraint or recovery action.

## Data Flow

### Public role row

The existing `/jobs/at/{company}` response is intentionally small:

```text
job_id, job_title, location_city, location_country, location_mode, created_at
```

That is enough to open a drawer and preserve intent. It is not enough to render
a full apply detail. V1 can add top skill metadata if the drawer needs preview
chips before CV upload, but it should not pretend to have the full job page.

### Logged-in fit

Continue using:

```text
POST /jobs/fit-batch
```

This endpoint is already bounded, deterministic, and no-charge. It reads stored
skills for the authenticated user.

### Logged-out fit bridge

Add one stateless contract, reusing existing services:

```text
POST /public/jobs/{job_id}/fit-preview
multipart/form-data:
  file: PDF or DOCX
  cf_turnstile_token?: string

response:
  job_id: string
  title: string
  company: string | null
  fit_pct: number
  matched_count: number
  total_skills: number
  matched_skills: string[]
  missing_skills: string[]
  cv_preview: existing anonymous score response subset
```

Implementation should reuse:

- file validation and Turnstile/rate-limit policy from `/public/score-cv`;
- `cv_parser.extract_raw_text`;
- `cv_parser.parse_cv_text`;
- `build_skill_level_map`;
- job skill lookup from the jobs repository;
- the overlap scoring logic used by `/jobs/fit-batch`.

No DB writes. No `user_skills`. No job application row. No CV history row.

If implementation needs to avoid a new endpoint, the fallback is B-lite:
anonymous users get a real CV score first, then signup reveals exact role fit.
That is acceptable as a temporary fallback but should not be labeled "fit
preview" because it does not answer the role-specific question yet.

## Routing

All auth entry points from the drawer carry a safe same-origin `next`.

Preferred next targets:

```text
has replayable CV + job_id -> /cv?jobId={job_id}
needs upload + job_id      -> /cv?upload=1&jobId={job_id}
no job_id fallback         -> /cv?upload=1
```

The signup modal should open in signup mode for new visitors and login mode only
when the user explicitly chooses sign in. A role fit click should not default to
login, because many public visitors are new.

## Non-Goals

- Full public job detail page with source URL and apply CTA.
- Global anonymous fit ranking across all companies.
- Saving anonymous jobs before account creation.
- Writing anonymous CVs to the database.
- LLM-generated advice in the public drawer.
- XP-gated deepener purchase in the public drawer.
- Claims about hiring probability or ATS acceptance.

## Error And Edge States

- No CV uploaded: show upload state.
- Unsupported CV: reuse existing PDF/DOCX failure copy.
- Scanned/empty PDF: reuse the anonymous scorer's scanned-PDF copy.
- Role has no taxonomy skills: show unknown fit, not 0%.
- Preview endpoint rate limited: ask the user to sign up or try later.
- Auth redirect drops in-memory file: preserve preview continuity and request
  re-upload only when needed.
- Save job already exists: treat as success and continue to tailoring.

## Analytics

Track these events:

- `public_fit_drawer_opened`
- `public_fit_cv_uploaded`
- `public_fit_preview_shown`
- `public_fit_signup_started`
- `public_fit_signup_completed`
- `public_fit_save_tailor_clicked`
- `public_fit_tailor_landed`

Required properties:

- `job_id`
- `company`
- `surface`
- `has_cv`
- `authed`
- `fit_band` when available

## Acceptance Criteria

1. Clicking a public role fit action preserves the exact `job_id`.
2. Logged-out users can understand the role before uploading a CV.
3. Logged-out users see a real one-job fit preview only after Myro has CV
   evidence.
4. Signup/login from the drawer returns to the same job context.
5. Logged-in users with a CV see inline fit and can open the populated drawer.
6. Logged-in users without a CV get one upload-first drawer, not repeated row
   nags.
7. `Save + tailor CV` lands on `/cv?jobId={job_id}`.
8. Unknown fit is represented as unknown, not as zero.
9. The flow works at 375px mobile width.
10. No anonymous CV, skill map, or job application is persisted before signup.

## Verification Plan

Frontend:

- Unit-test drawer state selection for anonymous, authed-with-CV, and
  authed-without-CV users.
- Test safe `next` building with `job_id`.
- Browser-test `/intel` at desktop and 375px.
- Verify keyboard focus and Escape close on the drawer.

Backend:

- Test stateless public preview rejects unsupported files and scanned PDFs.
- Test preview computes fit without creating `user_skills`, `cv_history`, or
  `job_applications` rows.
- Test jobs without taxonomy rows return unknown fit.
- Test rate limiting and Turnstile behavior match `/public/score-cv`.

Regression:

- Existing `/jobs/fit-batch` tests remain passing.
- Existing anonymous CV preview tests remain passing.
- Existing `/cv?upload=1` replay behavior remains passing.

## Recommended First Implementation Slice

1. Add the stateless public fit-preview backend endpoint and tests.
2. Add a `jobFitIntent` helper that builds safe next paths with `job_id`.
3. Replace row-level logged-out signup opening with the fit drawer.
4. Reuse `POST /jobs/fit-batch` for authenticated drawer content.
5. Wire `Save + tailor CV` to save the job and route to `/cv?jobId={job_id}`.
6. Browser-verify desktop and 375px flows.
