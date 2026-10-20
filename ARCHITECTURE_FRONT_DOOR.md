# Front door — "Which job do you want?"

**Architecture spec #57. Implementation by Cursor. Written 2026-10-02 from the
CEO grill (D6, Shivam, 2026-09-30).** UI slices go through `/frontend-design`.

> **VERIFY IN CODE before building.** Line numbers are from `a213fee2`. Each
> slice is its own commit on `Develop`, six gates green. Migrations are applied
> by the agent before the code that reads them, then `NOTIFY pgrst`.

> **Status 2026-10-20 — S0–S5 on `main` (#342, 2026-10-17); door telemetry live
> on prod from 2026-10-18. U4 desktop run 2026-10-19 found link paste broken
> (fixed `2cc7b264`) and 12 clicks to Download; FD2 `8c372968` made it 5: a pasted
> link reads itself, a never-tailored job opens on Mentor, Weave now on any
> question, Take all, no done screen. Phone U4 still owed.** Detail as built, 2026-10-14: partner consent (the signed-in Connect
> click, Google on that screen, and the emailed link) lands on `/onboarding`.
> That page already sends `position === "completed"` to `/market` and
> `result` to `/onboarding/result`; no CV stays on the upload. Measured in
> `post-auth-destination.test.ts` and `partner-sso-onboarding.test.ts`.
> Direct partner sign-in (no `link_partner`) is unchanged: a new account
> still enters onboarding, a returning one still opens `/market`. The 22%
> partner upload rate is the later read, after this is on `main`.
> S1: one import model (`createJobImport`). A link is reviewed before save;
> a failed extract offers paste-instead. Measured in `job-import.test.ts`.
> S2–S5 built 2026-10-14. After skills, no direction returns `awaiting_job_choice`
> and the result page paints three doors. Paste and the extension finish through
> `POST /onboarding/first-job` onto `/cv?jobId=`. Jobs that fit is Direction.
> The extension door is hidden below 768px. `/market` has Paste a job on desktop
> and phone, and a person with a CV and no direction sees "Want Myro to find
> more like this?" beside it. Door steps are in the core-loop vocabulary.
> Measured in `job-choice.test.ts`, `test_onboarding_first_role.py`, and
> `setup-nudge-step.test.ts`. The QA-account click-through is still owed.

---

## 1 · The decision

Myro is a machine that turns your CV into a tailored CV for the job you want.
So the first thing after the upload is the job, not a list of settings.

- After the CV upload and skill check, one screen: **"Which job do you want?"**
  with three doors:
  1. **Paste a job** — a link, the job description text, or a file.
  2. **Save from any site** — the Myro Chrome extension. Desktop only.
  3. **Show me jobs that fit** — Direction, then the judged list on /market.
- Doors 1 and 2 land in the tailor playground for that job (`/cv?jobId=…`).
  Door 3 runs Direction as today and lands on /market.
- For doors 1 and 2, **Direction comes after the first tailored CV**, offered,
  not forced. The chosen job is the intent for that first pass.
- "Paste a job" also sits at the top of /market, on desktop and on the phone.
- **Target:** upload → tailored CV downloaded in **under 10 minutes and at most
  5 clicks**.

## 2 · Evidence (prod, 2026-10-02, Myro's own accounts excluded)

- 430 people uploaded a CV; **17 ever tailored one (4%)**. Of those, 12 did it in
  the session they uploaded, median about 7 minutes. Speed is fine; reach is not.
- "I didn't know what to do after the upload" is the single biggest beta theme
  (17 of 113 reports) — BACKLOG QA check **U4** is this spec's acceptance.
- Bring-your-own-job: 1 real person imported 2 jobs and tailored a CV for both.
- **Partner SSO is half the platform and mostly never uploads.** 457 of 947
  people came through `/connect/[partner]`; **102 (22%) uploaded a CV**, against
  328 of 490 (67%) who signed up directly. Approval sends them straight to
  `/market` (`app/connect/[partner]/page.tsx:74`), past the upload.
- Keep Direction for door 3: `onboarding_service.py:990-1015` records that users
  with a target apply at 26% against 9% without one. Doors 1–2 carry the intent
  in the job itself.

## 3 · Today, read in code

- `/onboarding` uploads (`app/onboarding/page.tsx:45-65`) and pushes to
  `/onboarding/result`, which walks the server's result kinds
  (`app/onboarding/result/page.tsx:72-151`): `full_result_processing` →
  `awaiting_skill_confirmation` (`FirstRunPlayground`) → `awaiting_target`
  (`TargetConfirm`, i.e. Direction) → `onboarding_complete` → `/market`.
- A legacy branch already ends in the playground: `first_role_saved` →
  `tailor_href = /cv?jobId=…` (`services/onboarding_first_role.py:14-33`),
  accepted as a finished journey when `credible_job_saved_at` is set
  (`onboarding_service.py:1003-1010`). **This is the seam doors 1–2 reuse.**
- `JourneyProgress` has two steps: "Your CV" → "Direction"
  (`components/onboarding/journey-progress.tsx:11`).
- **Add-a-job exists twice, and they disagree.** Desktop `ManualAddModal`
  (`components/cv/pipeline/ManualAddModal.tsx`, mounted only by
  `collections-desktop.tsx:60`) runs extract-url → `importPreview` → `importJob`.
  Mobile `AddJobSheet` (`mobile/redesign/add-job-sheet.tsx`, mounted only by
  mobile Collections) runs extract-url → `importJob` with no preview. Backend:
  `/jobs/import/preview · extract-file · extract-url · import`
  (`routers/jobs/apply.py:172-292`) → `jobs_workflow.save_imported_job` →
  an `ext_…` job + a `job_applications` row + 20 coins.
- **Entries into this flow:** the landing dropzone → `/cv-preview` (anonymous) →
  `/signup` → onboarding; partner SSO `/connect/[partner]` → approve, Google,
  or the emailed link → `/onboarding` (S0; a finished journey still continues
  to `/market` from that page); `SetupNudge` and five other links to `/onboarding`
  (`setup-nudge.tsx:76`, `feed-card.tsx:88`, `persona-canvas.tsx:198`,
  `cv-score-progress.tsx:128`, `skill-path-rail.tsx:109,113`).

## 4 · The design

### A. One job-import model, two skins (ADR-0010 shape)

`frontend/lib/job-import/use-job-import.ts` — platform-agnostic, no JSX:

```ts
type JobImportState =
  | { step: "idle" }
  | { step: "extracting" }
  | { step: "review"; role: string; company: string; jd: string }   // editable
  | { step: "importing" }
  | { step: "imported"; jobId: string; tailorHref: string }
  | { step: "failed"; reason: string; canPasteInstead: boolean }
```

One flow for a link, pasted text, or a file; review is always shown (the
extractor sometimes reads a page tagline as the role). The web skin
(`JobImportDialog`, replacing `ManualAddModal`) and the phone skin (`AddJobSheet`)
render this model and own no fetch logic. Delete the duplicated logic in the
same slice. The interface is the test surface: drive the hook, assert states.

### B. The door screen — onboarding step 2

- A new computed result kind **`awaiting_job_choice`**, returned after skill
  confirmation unless the person already has a canonical direction or a credible
  saved job. Computed, not stored — no new onboarding column.
- `JourneyProgress` becomes **"Your CV" → "Your job"**. Direction is a sub-step of
  door 3 only.
- **Door 1 · Paste:** the job-import model inline. On `imported`, POST
  `/onboarding/first-job {job_id}`: sets `credible_job_saved_at`, completes
  onboarding, returns the `first_role_saved` receipt → `router.replace(tailor_href)`.
  Generalise `saved_first_role` to accept sources `onboarding_shortlist`,
  `onboarding_import` and `extension`.
- **Door 2 · Extension:** desktop only (hidden below 768px). Opens
  `EXTENSION_WEBSTORE_URL` (`lib/extension.ts`) and shows a waiting state that
  watches for the person's first new `ext_` application, then takes the same
  first-job path. Always offers "or paste the job instead".
- **Door 3 · Jobs that fit:** `TargetConfirm` exactly as today → `/market`.

### B2. Partner SSO lands on the upload, not on /market

**Partner users go through onboarding like everyone else.** After
`partnerConnect.approve`, `router.replace("/onboarding")` instead of `/market`.
`/onboarding` already sends a finished journey on to `/market` and a half-finished
one to `/onboarding/result` (`app/onboarding/page.tsx:41-42`) — one routing rule,
no second copy in the connect page.

### C. "Paste a job" on /market

A fixed entry above the list — desktop (`components/market/market-jobs-column.tsx`)
and phone (`mobile/redesign/jobs-surface.tsx`) — opening the same model; on
`imported`, straight to `/cv?jobId=…`.

### D. Direction after the first tailored CV

Doors 1–2 people have no direction yet, so /market cannot judge a list for them.
/market shows the "Paste a job" entry plus the existing `SetupNudge` asking for a
direction ("Want Myro to find more like this?") — never an empty list. The
playground keeps Apply as the step after download (`a624c2e1`); the direction ask
waits until after that.

### E. Telemetry — the target must be measurable

Widen `core_loop_events.step` with **`door_shown`, `door_paste`,
`door_extension`, `door_fit`, `job_imported`**: migration on the CHECK, the
`CoreLoopStep` union (`lib/api.ts:2506`) and the `CORE_LOOP_STEPS` tuple
(`routers/telemetry.py:91`), held together by `test_telemetry_vocabulary.py`.
Minutes = first terminal `cv_upload` phase → first `downloaded`, per person.
Clicks = `core_loop_events` rows between them.

## 5 · People who came before (forward pass — never a backfill)

- Anyone who finished onboarding before this ships never sees the door screen;
  they meet "Paste a job" at the top of /market and Collections.
- Anyone mid-onboarding sees the door on their next visit — the kind is computed.
- The 111 "completed without a direction" people stop being forced through
  Direction; they get the door.

## 6 · Platform sweep

| Surface | What this spec requires |
|---|---|
| Desktop web | Door screen, dialog skin, /market entry |
| Phone web, 375px | Same door screen (onboarding is shared web); extension door hidden; sheet skin; mobile Jobs entry. Check in `/dev/phone` |
| PWA | No change beyond the web routes |
| Chrome extension | Door 2 only; its saves already arrive as `ext_` applications |
| Anonymous `/cv-preview` | After signup and the claimed upload, lands on the door like anyone else |
| Partner SSO (48% of people) | Lands on the upload when there is no CV (B2), then the door like anyone else |
| LinkedIn Services door | Unaffected (#56 redirects it to `/apply-pack`) |
| Coins | Import keeps its +20 reward; the door costs nothing |
| Read path | No new read on `/users/me`; the door screen fetches nothing new until a door is used |
| Reach gate | No new route — the door is a step inside `/onboarding/result` |
| Light / dark, a11y | Tokens only; the three doors are labelled buttons in one group; focus lands on the first |

## 7 · Work, in order

| # | Slice | Done when |
|---|---|---|
| S0 | B2 · partner SSO goes through onboarding | **Shipped 2026-10-14.** Connect approval, the Google return, and the emailed link all enter `/onboarding`. A finished journey still reaches `/market` from that page. |
| S1 | `use-job-import` + both skins; delete the duplicate logic | **Shipped 2026-10-14.** `createJobImport`: link → review → imported, and a failed extract offers paste-instead. `JobImportDialog` replaces `ManualAddModal`; `AddJobSheet` renders the same model. Neither skin fetches. |
| S2 | Backend: `awaiting_job_choice`, `POST /onboarding/first-job`, generalised `saved_first_role` | **Shipped with S3.** Door kind after skills; first-job receipt; idempotent retry. |
| S3 | Door screen + `JourneyProgress` labels + telemetry migration | **On `main` 2026-10-17 (#342).** Result page paints the three doors; rail says Your CV → Your job. The CHECK migration (`20261014193000`) reached prod only 2026-10-18; prod rejected 6 beacons in between (Railway `core_loop.persist_failed`): 3 real people, each `door_shown` → `door_fit`, none tailored by 10-18. QA click-through still owed. |
| S4 | "Paste a job" on /market, desktop and phone | **Built 2026-10-14.** `PasteJobEntry` on the desktop feed and the phone jobs surface; import opens `/cv?jobId=`. |
| S5 | Direction-after-download nudge for doors 1–2 | **Built 2026-10-14.** No-direction copy is "Want Myro to find more like this?", beside Paste a job, so /market is not an empty list. |

## 8 · Out of scope

Changing the score or the matcher · Agent Picks · extension submit detection
(BACKLOG §2) · #55's list currency.

## 9 · How we will know it worked

- QA **U4** passes on a fresh account, desktop and phone.
- `core_loop_events` shows the door split; median upload → download for door 1
  is under 10 minutes with at most 5 events between.
- Tailored ÷ uploaded climbs from 4% — read it per week on `loop_reach.py`.
- Partner-cohort upload rate climbs from 22% toward the direct cohort's 67%.
