# Intern Beta Feedback Submission

- **Date:** 2026-06-14
- **Status:** Approved design
- **Route:** `/beta-feedback`
- **Storage:** existing `public.user_feedback`

## Purpose

Create a permanent assignment-submission link for prospective interns who test
Myro with their own CV. The form must produce structured product-research data
without using a new database table or storing CV content.

The primary research question is:

> Can a first-time job seeker reach, understand, trust, and act on a useful
> Myro result within 30 minutes on their normal device and connection?

## Locked decisions

- A Myro login is required.
- Each Myro user can submit once.
- Submission is final and cannot be edited.
- The form has no deadline and stays open.
- The UI is a guided three-step flow.
- Draft answers stay in browser storage until successful submission.
- Responses use the existing `user_feedback` table.
- v1 stores no CV content, CV file, screenshot, or attachment.
- The final screen shows all answers before the irreversible submit action.

## User flow

1. The candidate opens `https://www.himyro.com/beta-feedback`.
2. A logged-out candidate is sent to
   `/login?next=%2Fbeta-feedback` and returned after authentication.
3. The page checks whether this user already submitted.
4. If submitted, the page shows a receipt with the submission ID and date.
5. If not submitted, the page restores that user's local draft.
6. The candidate completes:
   - Step 1: test-session context;
   - Step 2: written assessment;
   - Step 3: ratings, confirmations, and final review.
7. The candidate confirms that the submission is final.
8. The backend validates and inserts one row.
9. The UI clears the local draft only after receiving a successful receipt.

Back navigation between steps is allowed before submission. The final
submission cannot be updated or deleted through this feature.

## Readability contract

Readability is a release requirement, not visual polish.

- Main form heading: at least `26px`, line height no tighter than `1.18`.
- Body text, labels, fields, and choices: at least `16px`.
- Supporting metadata: at least `14px`.
- Inputs and buttons: at least `50px` high.
- Primary text contrast: WCAG AA, targeting at least `7:1`.
- Muted instructional text: WCAG AA, at least `4.5:1`.
- Visible keyboard focus on every interactive control.
- Error text is placed next to the affected field and announced to assistive
  technology.
- The page has no horizontal overflow at `375px`.
- Progress is communicated with both text (`Step 1 of 3`) and a visual bar.
- The form uses explicit high-contrast colors so inherited application themes
  cannot make text disappear.

The implementation uses Tailwind utilities, the existing shadcn `Button`, and
semantic native form controls.

## Form contract

### Step 1 - Test session

- `role_stream`: Product, Design, Marketing, Operations, or Other.
- `device_type`: Mobile, Laptop, Desktop, or Tablet.
- `operating_system`: Android, iOS, Windows, macOS, Linux, or Other.
- `browser`: Chrome, Safari, Edge, Firefox, or Other.
- `connection_type`: Wi-Fi, Mobile data, Mixed, or Unknown.
- `session_outcome`: Completed, Partial, or Blocked before a result.
- `time_to_value`: Under 5, 5-10, 11-20, 21-30 minutes, or No useful result.
- `areas_explored`: one or more approved Myro product areas.

### Step 2 - Assessment

- `product_understanding`
- `most_useful_moment`
- `biggest_problem_area`
- `biggest_problem`
- `attempted_action`
- `expected_result`
- `actual_result`
- `reproduction_steps` (optional)
- `priority_improvement`
- `priority_reason`
- `preserve`
- `return_trigger`

The backend applies explicit minimum and maximum lengths. The frontend mirrors
the same limits for immediate feedback, but the backend is authoritative.

### Step 3 - Ratings and confirmation

Each rating is an integer from 1 to 5:

- `rating_next_step`
- `rating_trust`
- `rating_relevance`
- `rating_return`
- `rating_recommend`

Required confirmations:

- no CV is attached to the response;
- personal information was removed from any described evidence;
- observations came from the candidate's own session; and
- the candidate understands that submission is final.

## Stored row

The dedicated endpoint writes:

```json
{
  "user_id": "<authenticated-user-id>",
  "type": "feedback",
  "status": "received",
  "payload": {
    "program": "intern_beta_assignment_v1",
    "schema_version": 1,
    "submitted_via": "beta_feedback_page",
    "role_stream": "Product",
    "session": {},
    "assessment": {},
    "ratings": {},
    "confirmations": {}
  }
}
```

The server, not the client, stamps `program`, `schema_version`, and
`submitted_via`.

The row intentionally contains no email. `user_id` is the durable identity
link, and authorized internal analysis can resolve it separately when needed.

## One-submission enforcement

A migration adds a partial unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_user_feedback_intern_beta_assignment_v1_user
ON public.user_feedback (user_id)
WHERE user_id IS NOT NULL
  AND type = 'feedback'
  AND payload->>'program' = 'intern_beta_assignment_v1';
```

The API checks for an existing row to return a friendly conflict, but the
database index is the authority and closes concurrent-request races.

The generic `POST /feedback` endpoint rejects payloads whose `program` equals
`intern_beta_assignment_v1`. Only the dedicated validated endpoint may create
this reserved feedback subtype.

## API

### `GET /feedback/beta-assignment`

Authentication required.

When no submission exists:

```json
{ "submitted": false, "receipt": null }
```

When a submission exists:

```json
{
  "submitted": true,
  "receipt": {
    "id": 123,
    "submitted_at": "2026-06-14T12:00:00Z"
  }
}
```

The endpoint returns receipt metadata only, not the full immutable response.

### `POST /feedback/beta-assignment`

Authentication required. Accepts the typed form contract.

Success:

```json
{
  "id": 123,
  "submitted_at": "2026-06-14T12:00:00Z"
}
```

Errors:

- `401`: authentication required;
- `409`: this account already submitted;
- `422`: invalid or incomplete form data;
- `500`: storage failed without creating a row.

## Frontend structure

- `app/(authed)/beta-feedback/page.tsx`: route and metadata.
- `components/beta-feedback/beta-feedback-form.tsx`: query, mutation, and step
  orchestration.
- `components/beta-feedback/session-step.tsx`: Step 1 fields.
- `components/beta-feedback/assessment-step.tsx`: Step 2 fields.
- `components/beta-feedback/review-step.tsx`: ratings, full review, and final
  confirmation.
- `components/beta-feedback/field.tsx`: accessible shared label/error wrapper.
- `components/beta-feedback/types.ts`: form and receipt types.
- `components/beta-feedback/use-beta-feedback-draft.ts`: versioned local draft.

The local-storage key includes the authenticated user ID:

```text
myro.beta-feedback.v1.<user-id>
```

This prevents draft crossover when multiple accounts use one browser.

TanStack Query owns server state. All backend calls go through `lib/api.ts`.
Local draft and current step remain component-local browser state.

## Failure behavior

- Initial status failure shows a retryable error and does not show the form.
- Submission failure preserves the draft and keeps the candidate on review.
- A `409` refetches the receipt and switches to the submitted state.
- Refresh or browser closure restores the draft for the same user.
- Successful submission clears only that user's versioned draft.
- No client action can overwrite an existing submission.

## Testing

Backend tests cover:

- authentication on both endpoints;
- validated successful insert;
- receipt lookup;
- pre-existing submission conflict;
- database uniqueness race mapped to `409`;
- reserved program rejection on generic feedback;
- invalid ratings, empty areas, length limits, and false confirmations;
- migration index contract.

Frontend verification covers:

- API client contract;
- versioned per-user draft storage;
- three-step progression and back navigation;
- validation before advancing;
- full final review;
- irreversible-submission warning;
- receipt state;
- retry state and draft preservation;
- 375px mobile layout, keyboard navigation, labels, focus, and contrast.

Required project checks:

```text
pytest backend/tests
tsc --noEmit
next lint
next build
```

## Deployment

1. Apply the partial-index migration to the shared Supabase project.
2. Deploy the `Develop` backend and frontend to their preview/dev services.
3. Verify login redirect, one successful submission, receipt refresh, and
   duplicate rejection.
4. Merge through `Develop`; do not deploy directly to `main`.
5. Replace `[SUBMISSION LINK]` in the candidate message with
   `https://www.himyro.com/beta-feedback` once production is live.
