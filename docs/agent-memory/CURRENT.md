# Shared Agent Memory Contract

This is the default retrieval guide for Codex and Claude working in
`True_Yodha`. It records current product truth and where to verify it; it is
not a session transcript.

## Retrieval order

1. Current code, migrations, persisted records, and deployed evidence.
2. `AGENTS.md` for operating rules and locked repository decisions.
3. This file for cross-agent product truth.
4. A topic note only when its frontmatter says `status: current` or when this
   file names it as canonical for that concern.
5. Historical notes, raw exports, and Graphify only for an explicitly scoped
   investigation. They never override live evidence.

Every new topic note must declare:

```yaml
status: current | historical | superseded | unresolved
canonical_for: short domain, if any
superseded_by: path or null
verified_against: commit, migration, code path, or date
retrieval: default | on_demand
```

## Current product loop

1. **One Master CV** is the user-owned source of CV evidence. CV versions are
   immutable snapshots; tailored copies never fabricate claims.
2. **Jobs** are matched from confirmed CV evidence plus the user's chosen role,
   aspirations, seniority, and supported locations. Job liveness is shown only
   from verifier evidence.
3. **Upskilling** follows demand grounded in live jobs and the user's target.
   Learning assessments write `skill_assessed_level`; they never silently alter
   CV-derived `user_skills`, job matching, or the Myro Score. A user may
   explicitly promote a cleared level to the Main CV: Mentor rewrites existing
   evidence, or Skills Refresh adds only the assessed Skill to `skills_line`.
4. **Paths forward** are specific next actions: improve CV proof, prepare a
   saved job, or complete a source-grounded learning step.

## Verified active decisions

- **CV and applications:** `project_cv_playground_linkedin_tracker.md` is the
  canonical contract for one active tailored CV per exact job, immutable
  submitted snapshots, and honest application handoff.
- **Role targeting:** `project_role_family_targeting.md` is the current
  role-family and aspirations handoff. Do not invent a canonical cross-product
  role-intent contract before its unresolved decision is made.
- **Intel:** `project_signal_thread_intel_unification.md` is the canonical
  company-signal contract. Logged-in heatmap lives at `/intel`; legacy
  `/market?tab=heatmap` links redirect there with the skill facet.
- **Practice:** timed Forge earning, timer state, and `forge_sessions` reads
  are retired. `backend/app/services/forge_service.py` is authoritative:
  levels now advance from Upskilling quiz clears. Never reintroduce a timer
  from an old note without a new product decision.
- **Learning content:** active questions require the source-grounded serving
  contract. Learning truth remains separate from CV and matching truth until a
  user explicitly accepts a Main-CV update through the existing review path.

## Historical material

- Codex `raw_memories.md` is a forensic merged export, not retrieval input.
- Completed session summaries belong in Git history and the shared graph, not
  in `AGENTS.md`.
- A file named `*superseded*` or `*retired*` is on-demand context only unless a
  current note explicitly revives it.

## Shared graph

The combined durable-memory graph is outside the repository at
`/Users/incognito/.codex/memory-graphs/true-yodha-shared-v2/graphify-out/`.
Use its report to find related notes, then verify each conclusion against the
sources above.
