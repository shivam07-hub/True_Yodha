# Intern Beta Feedback Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `https://www.himyro.com/beta-feedback` as a readable,
authenticated, one-time, final beta-assignment submission flow backed by the
existing `user_feedback` table.

**Architecture:** Add a partial unique index and dedicated validated endpoints
inside the feedback router. Build a three-step Next.js form whose versioned,
per-user draft remains local until the backend returns an immutable receipt.

**Tech Stack:** FastAPI, Pydantic, Supabase/PostgreSQL, Next.js 14, React,
TanStack Query, Tailwind CSS, shadcn Button, node:test, pytest.

---

## File Map

- `database/migrations/20260614_intern_beta_feedback_submission.sql`: one-row
  database invariant.
- `backend/app/routers/feedback.py`: validated receipt and submit endpoints.
- `backend/tests/test_feedback_router.py`: endpoint behavior.
- `backend/tests/test_beta_feedback_migration.py`: SQL contract.
- `frontend/lib/api.ts`: typed API client.
- `frontend/lib/beta-feedback.ts`: form types, options, validators, draft IO.
- `frontend/components/beta-feedback/*.tsx`: focused step components and
  orchestrator.
- `frontend/components/beta-feedback/beta-feedback.css`: explicit readable
  palette and responsive layout.
- `frontend/app/(authed)/beta-feedback/page.tsx`: authenticated route.
- `frontend/tests/beta-feedback-contract.test.mjs`: helper and UI contracts.
- `frontend/package.json`: focused test script.
- `User_Feedbacks/01-candidate-assignment-message.md`: live submission link.
- `AGENTS.md`: session handoff.

### Task 1: Database Invariant and Backend API

**Files:**
- Create: `database/migrations/20260614_intern_beta_feedback_submission.sql`
- Modify: `backend/app/routers/feedback.py`
- Modify: `backend/tests/test_feedback_router.py`
- Create: `backend/tests/test_beta_feedback_migration.py`

- [ ] **Step 1: Write failing tests**

Add endpoint tests for unauthenticated access, empty receipt, existing receipt,
successful nested payload insert, pre-existing conflict, database race,
reserved-program rejection on generic feedback, invalid ratings, empty areas,
and false confirmations.

```python
response = client.get(
    "/feedback/beta-assignment",
    headers={"Authorization": "Bearer t"},
)
assert response.json() == {"submitted": False, "receipt": None}

response = client.post(
    "/feedback/beta-assignment",
    json=_valid_beta_assignment(),
    headers={"Authorization": "Bearer t"},
)
assert response.status_code == 201
assert chain._inserted["payload"]["program"] == "intern_beta_assignment_v1"
```

- [ ] **Step 2: Verify RED**

```bash
.venv/bin/pytest \
  backend/tests/test_feedback_router.py \
  backend/tests/test_beta_feedback_migration.py -q
```

Expected: collection or assertion failures because the feature is absent.

- [ ] **Step 3: Add the migration**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_user_feedback_intern_beta_assignment_v1_user
ON public.user_feedback (user_id)
WHERE user_id IS NOT NULL
  AND type = 'feedback'
  AND payload->>'program' = 'intern_beta_assignment_v1';

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Implement the complete request model**

Use these exact enum sets:

```python
RoleStream = Literal["Product", "Design", "Marketing", "Operations", "Other"]
DeviceType = Literal["Mobile", "Laptop", "Desktop", "Tablet"]
OperatingSystem = Literal["Android", "iOS", "Windows", "macOS", "Linux", "Other"]
Browser = Literal["Chrome", "Safari", "Edge", "Firefox", "Other"]
ConnectionType = Literal["Wi-Fi", "Mobile data", "Mixed", "Unknown"]
SessionOutcome = Literal["Completed", "Partial", "Blocked before a result"]
TimeToValue = Literal[
    "Under 5 minutes", "5-10 minutes", "11-20 minutes",
    "21-30 minutes", "No useful result",
]
ProductArea = Literal[
    "Landing and signup", "CV upload", "CV analysis or Myro Score",
    "CV Hub or tailoring", "Skills or Forge", "Jobs or matches", "Intel",
    "Tracker", "Diary", "Settings or feedback", "Other",
]
```

The request has the seven session fields, non-empty `areas_explored`, the
twelve assessment fields from the spec, five `1..5` ratings, and three
`Literal[True]` confirmations. Required assessment text uses `10..2000`
characters; `reproduction_steps` is optional with a `2000` maximum.

- [ ] **Step 5: Implement endpoint behavior**

Add `BETA_ASSIGNMENT_PROGRAM = "intern_beta_assignment_v1"`, receipt models,
`GET /feedback/beta-assignment`, and `POST /feedback/beta-assignment`.
Authenticate with `_require_user_id`, stamp reserved metadata server-side, and
store session, assessment, ratings, and confirmations as nested payload maps.
Catch `APIError.code == "23505"` and return `409`. The generic feedback endpoint
returns `422` when the payload contains the reserved program marker.

- [ ] **Step 6: Verify GREEN and commit**

Run the focused pytest command, then:

```bash
git add database/migrations/20260614_intern_beta_feedback_submission.sql \
  backend/app/routers/feedback.py backend/tests/test_feedback_router.py \
  backend/tests/test_beta_feedback_migration.py
git commit -m "feat: add final beta feedback submission API"
```

### Task 2: Frontend Contracts and Draft Persistence

**Files:**
- Create: `frontend/lib/beta-feedback.ts`
- Modify: `frontend/lib/api.ts`
- Create: `frontend/tests/beta-feedback-contract.test.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: Write failing contract tests**

Assert the API exposes `betaAssignmentStatus` and `submitBetaAssignment`; the
helper exposes allowed options, `initialBetaFeedbackDraft`, three step
validators, and `myro.beta-feedback.v1.<user-id>` draft storage.

- [ ] **Step 2: Verify RED**

```bash
cd frontend && node --test tests/beta-feedback-contract.test.mjs
```

Expected: failure because the client and helper module are absent.

- [ ] **Step 3: Implement pure form helpers**

Define `BetaFeedbackDraft`, status/receipt types, exact option arrays, initial
values, `validateSessionStep`, `validateAssessmentStep`,
`validateReviewStep`, `loadBetaFeedbackDraft`, `saveBetaFeedbackDraft`, and
`clearBetaFeedbackDraft`. Parsing rejects malformed or wrong-version data.

- [ ] **Step 4: Implement typed API calls**

```typescript
betaAssignmentStatus: (token: string) =>
  request<BetaAssignmentStatus>("/feedback/beta-assignment", {
    headers: { Authorization: `Bearer ${token}` },
  }),
submitBetaAssignment: (token: string, body: BetaFeedbackDraft) =>
  request<BetaAssignmentReceipt>("/feedback/beta-assignment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }),
```

- [ ] **Step 5: Verify GREEN**

Run the focused node test and require zero failures.

### Task 3: Readable Three-Step Form

**Files:**
- Create: `frontend/components/beta-feedback/field.tsx`
- Create: `frontend/components/beta-feedback/session-step.tsx`
- Create: `frontend/components/beta-feedback/assessment-step.tsx`
- Create: `frontend/components/beta-feedback/review-step.tsx`
- Create: `frontend/components/beta-feedback/beta-feedback-form.tsx`
- Create: `frontend/components/beta-feedback/beta-feedback.css`
- Create: `frontend/app/(authed)/beta-feedback/page.tsx`
- Modify: `frontend/tests/beta-feedback-contract.test.mjs`

- [ ] **Step 1: Extend tests and verify RED**

Assert the route renders `BetaFeedbackForm`; progress says `Step {step} of 3`;
review states submission is final; CSS contains `26px`, `16px`, `50px`, visible
focus, and the `480px` mobile breakpoint. Run the node test and observe failure.

- [ ] **Step 2: Implement the form**

Use `useAuth`, `users.me`, TanStack Query, and the beta API client. Hydrate the
draft only after the user ID resolves. Implement validation, Back/Continue,
full review, required final checkbox, loading, retry, receipt, and `409`
receipt-refetch states. Clear the draft only after success.

- [ ] **Step 3: Implement readability CSS**

```css
.bf-card { background: #fff; color: #171914; }
.bf-title { font-size: 26px; line-height: 1.18; }
.bf-label, .bf-control { font-size: 16px; }
.bf-control, .bf-button { min-height: 50px; }
.bf-control:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
```

Use one column and `16px` gutters at mobile widths. Never inherit low-contrast
text colors into the white form card.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd frontend && npm run test:beta-feedback
git add frontend/app/'(authed)'/beta-feedback \
  frontend/components/beta-feedback frontend/lib/beta-feedback.ts \
  frontend/lib/api.ts frontend/tests/beta-feedback-contract.test.mjs \
  frontend/package.json
git commit -m "feat: add readable beta feedback form"
```

### Task 4: Validation and Browser QA

- [ ] **Step 1: Run focused and full checks**

```bash
.venv/bin/pytest backend/tests/test_feedback_router.py \
  backend/tests/test_beta_feedback_migration.py -q
cd frontend && npm run test:beta-feedback
.venv/bin/pytest backend/tests
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
cd frontend && npm run build
git diff --check
```

Fix new failures. Record unrelated pre-existing failures with exact output.

- [ ] **Step 2: Browser QA**

Verify logged-out redirect, per-user draft restore, step validation, Back,
complete final review, final confirmation, receipt state, duplicate state,
keyboard focus, and no horizontal overflow at desktop and `375x812`.

### Task 5: Live Migration, Launch Docs, and Push

**Files:**
- Modify: `User_Feedbacks/01-candidate-assignment-message.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Apply and verify the migration**

Apply the SQL to Supabase project `gipvxuugajkugntwkeiz`, then verify the index
through `pg_indexes`.

- [ ] **Step 2: Update and commit launch docs**

Replace both `[SUBMISSION LINK]` values with
`https://www.himyro.com/beta-feedback`; retain `[DEADLINE]`. Record validation
and deployment state in `AGENTS.md`.

```bash
git add User_Feedbacks/01-candidate-assignment-message.md AGENTS.md
git commit -m "docs: prepare intern beta feedback launch"
```

- [ ] **Step 3: Push Develop**

Fetch and integrate remote `Develop` without overwriting unrelated local edits,
push `Develop`, and verify the remote branch contains every feature commit.
