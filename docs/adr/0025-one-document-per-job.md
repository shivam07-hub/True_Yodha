# One Document Per Job — The Newest Row For a Job IS That Job's CV

**Status:** Accepted
**Date:** 2026-09-18
**Related:** ADR-0020 (CV artifact WYSIWYG contract), ADR-0023 (reservoir is the master CV), CONTEXT.md §Job Document

## Decision

For a `(user, job)` there is exactly **one** document that *is* that job's CV. Every operation
edits that document. Nothing mints a sibling seeded from the master while a document exists.

Identity is **defined, not stored**: the job document is the **newest `cv_versions` row carrying
that `job_id`, of any kind**. Newest revision is the document, the way a shared doc works. A
master CV has no `job_id`, so a baseline can never be mistaken for one.

Four rules follow, and every reader and writer is held to them:

1. **Identity is read, never ranked.** No caller picks between candidate rows by kind.
2. **Every writer seeds from the job document.** The master seeds it only the first time, when
   there is none.
3. **Patch in place by default.** A new row only for acts the user asked to be separate — a
   polish or a structured edit, which keep provenance through `parent_version_id` — and that row
   then *becomes* the document.
4. **`kind` is a lineage label, not identity.** Reading or writing "this job's CV" must never
   filter on `kind`.

`CVVersionsRepository.job_document` is the one reader. `update_job_draft` is the one in-place
writer, scoped by `job_id is not null`.

## Why

The goal is one CV per job, downloaded and sent — not a library of candidates
(Shivam, 2026-09-18: *"we are curating one CV per job — that's the goal of the platform"*).
The code had drifted to the opposite shape: **three writers minted `kind='deterministic'` rows
for one job** (weave apply, playground Save, reservoir projection) and **one reader picked
between them by version number** while filtering out every `polished` or `edited` row.

That produced silent data loss in production. On 2026-08-30, for one user's Provakil draft:

| row | what wrote it | `cv_structured` |
|---|---|---|
| 475 | master CV | `fe28c111` |
| 552 | weave apply, 14:11:36 — the user's accepted lines | `fe688eb3` |
| 553 | playground Save, 14:12:59 | `fe28c111` — byte-identical to the master |

Save built its row from `baseline.get("cv_structured")` and never read the draft, so it filed a
copy of the untouched master as the newest row 83 seconds after the user accepted their tailored
lines. The next Keep/Take then resolved "this job's draft" to 553 and patched *that*. The user
ended with three near-identical CVs for one job and no way to tell which one the next action
would land on.

A latent case of the same fault: polish a tailored CV, and the `kind='deterministic'` filter
makes the polished row invisible — the next Keep/Take patches the pre-polish row and the polish
is orphaned.

## Considered Options

- **Store identity — `cv_versions.is_job_document` + a partial unique index on
  `(user_id, job_id)`:** rejected *for now*. Explicit and enforceable at the database, but it is
  a schema change on a database dev and prod share, to fix a problem that a query change already
  fixes. Still open to build on top if definition proves insufficient.
- **A separate `job_documents` table:** rejected — a second source of truth for a row that
  already exists, and every reader would need both.
- **Keep ranking, just widen the filter:** rejected — ranking *is* the defect. Two writers
  racing produce two plausible winners and the loser's content vanishes without an error.
- **Define identity as the newest row for the job (accepted):** satisfies all four rules, no
  migration, and matches what the user already believes is true when they look at the screen.

## Consequences

- `latest_job_draft` is gone. It was named for one writer's private draft and filtered to that
  writer's kind; both were the bug. `job_document` replaces it.
- Playground Save patches the document instead of creating a row. It only creates on a job that
  has none.
- The reservoir projection replaces the job's document rather than filing a rival copy.
- `patch_job_draft` and the hidden-items autosave accept any kind with a `job_id`.
- The frontend stops treating a non-`deterministic` selection as "no draft" and falling through
  to create.
- Version history still exists for provenance and undo; it is no longer a set of competing
  candidates for what "this job's CV" means.
