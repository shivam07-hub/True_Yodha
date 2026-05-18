# Myro — Domain Context

Durable vocabulary. Use these terms in code, commits, ADRs, and architecture reviews. Update this file when a new domain concept crystallises, or when an existing term sharpens. Source of truth for the language we use to talk about the product.

---

## CV Version

A single immutable snapshot of a CV. Stored as one row in `cv_versions`. Every interaction that produces a new shape of a CV — uploading a file, saving a tailored playground state, polishing with the LLM, editing polished text — creates a new row. Existing rows are never mutated.

**Attributes**

- `kind` — one of:
  - `baseline_upload` — a CV the user uploaded. The truth-of-record for "the user's CV" at the time of upload. `job_id IS NULL`.
  - `deterministic` — a per-job tailored CV saved from the playground. Hidden bullets removed, edited bullets applied, deterministic render of `cv_structured`. `job_id IS NOT NULL`.
  - `polished` — an LLM rewrite of a `deterministic` (or another `polished` / `edited`) row. `job_id IS NOT NULL`.
  - `edited` — a user-edited variant of a `polished` row. `job_id IS NOT NULL`.
- `user_version_number` — monotonic per user, **global across kinds**. v1, v2, v3, … never resets per-job. Baseline rows occupy low numbers (in upload order); derivatives extend the same sequence (in creation order). The number that appears in the UI dropdown is this one.
- `job_id` — `NULL` on baselines; the target job on every derivative.
- `parent_version_id` — points at the row this one was created from. `NULL` for `baseline_upload`. Not null otherwise.
- `baseline_version_id` — materialised at write time. On derivatives, copies the parent's `baseline_version_id` (if parent is itself a derivative) or the parent's `id` (if parent is a baseline). On `baseline_upload` rows, `NULL`. This is what powers the "from v1" badge in the UI — no parent-chain walk needed at read time.
- `cv_structured` — JSONB snapshot of the structured CV (summary, experience, projects, education, skills, certs). **Snapshotted on every row.** Derivatives copy their parent's `cv_structured` at write time; reworking the baseline does not mutate prior derivatives.
- `body_text` — for baselines, the raw upload text. For derivatives, the deterministic render. Never null.
- `polished_text` — populated only on `polished` / `edited` rows.
- `hidden_items`, `edited_items` — JSONB. The user's playground state at the time of save. Derivatives only.

**Reads**

- "Current baseline" = `cv_versions WHERE user_id = ? AND kind = 'baseline_upload' ORDER BY created_at DESC LIMIT 1`.
- "All versions for the CV page" = `cv_versions WHERE user_id = ? AND (job_id IS NULL OR job_id = ?)`. One query returns both the baseline timeline and the per-job derivative chain.

---

## CV Lineage

The directed graph formed by `parent_version_id` across a user's CV Versions.

**Rules**

- Any parent owned by the same user is allowed. No `job_id` alignment requirement between parent and child. A derivative under `job_id = B` may parent a derivative under `job_id = A` (enables future cross-job forking workflows).
- Baselines have no parent.
- `baseline_version_id` is the authoritative anchor — it tells you which baseline a derivative was snapshotted from, regardless of how many polish/edit hops sit between.

**Rework semantics**

- Uploading a new CV creates a new `baseline_upload` row. Prior derivatives keep their `cv_structured` snapshot and their `baseline_version_id` pointing at the old baseline. The UI surfaces this as a "from v{n} · stale" badge when `derivative.baseline_version_id !== currentBaseline.id`.
- Users opt in to rebasing by saving a new version against the new baseline from the playground.

---

## CV Version Writer Seam

`CVVersionsRepository.create(spec: CVVersionWriteSpec)` is the single seam through which CV Versions enter the database. Every endpoint that produces a version — upload, save playground, polish, edit — reduces to building a spec and calling this method. The repository owns:

- Computing the next `user_version_number`.
- Propagating `baseline_version_id` from the parent.
- Enforcing invariants: `kind` ↔ `job_id` consistency, parent ownership, baseline-required-on-derivative.
- Snapshot hash, default title, timestamps.

Endpoints never write to `cv_versions` directly. If a new flow needs to create a version, it goes through the spec.
