# Public Intel Runner Tracked Companies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public `/intel` LLM runner console show only real tracked companies and the honest local scraper model label.

**Architecture:** Add a pure console model helper under `frontend/components/public/intel/`, then pass analytics company data from `IntelPane` into `IntelHero`. The React component stays visual; data shaping and fallback behavior are testable in isolation.

**Tech Stack:** Next.js 14, React, TypeScript strict mode, Node test runner with `tsx`.

---

## File Structure

- Create: `frontend/components/public/intel/intel-console-model.ts`
  - Owns model labels, console seed generation, metadata formatting, and the neutral fallback seed.
- Modify: `frontend/components/public/intel/intel-data.ts`
  - Remove fake company `LOG_SEEDS`; keep shared intel utilities.
- Modify: `frontend/components/public/intel/intel-hero.tsx`
  - Accept real console companies, render model chips, and rotate through generated seeds.
- Modify: `frontend/components/public/intel-pane.tsx`
  - Pass `analytics.by_company` and `analytics.latest_batch` into the public hero.
- Modify: `frontend/components/public/intel-pane.css`
  - Add styles for model chips and the batch footer label.
- Modify: `frontend/tests/layout-intel-contract.test.mjs`
  - Add source-level contract checks for the public console.
- Create: `frontend/tests/intel-console-model.test.ts`
  - Test the pure data model.

### Task 1: Failing Console Model Test

**Files:**
- Create: `frontend/tests/intel-console-model.test.ts`
- Create later: `frontend/components/public/intel/intel-console-model.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test"
import assert from "node:assert/strict"

import {
  RUNNER_MODEL_LABELS,
  buildConsoleSeeds,
} from "../components/public/intel/intel-console-model"

test("console seeds preserve exact tracked company names from analytics", () => {
  const seeds = buildConsoleSeeds([
    { name: "Deloitte India", count: 42, last_seen_at: "2026-06-04T00:00:00+00:00" },
    { name: "Razorpay", count: 7, last_seen_at: null },
  ])

  assert.deepEqual(seeds.map((seed) => seed.path), ["Deloitte India", "Razorpay"])
  assert.equal(seeds[0].meta, "42 jobs - scraped 2026-06-04")
  assert.equal(seeds[1].meta, "7 jobs - tracked")
})

test("console fallback never invents a company name", () => {
  const seeds = buildConsoleSeeds([])

  assert.equal(seeds.length, 1)
  assert.equal(seeds[0].path, "tracked company feed")
  assert.equal(seeds[0].meta, "syncing")
})

test("runner model labels describe the local scraper enrichment model", () => {
  assert.deepEqual(RUNNER_MODEL_LABELS, ["Local LM Studio", "google/gemma-3-4b"])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test tests/intel-console-model.test.ts`

Expected: fail because `intel-console-model` does not exist.

### Task 2: Minimal Console Model

**Files:**
- Create: `frontend/components/public/intel/intel-console-model.ts`

- [ ] **Step 1: Implement the helper**

```ts
export type ConsoleOp = "parse" | "fetch" | "index" | "embed"

export interface ConsoleCompany {
  name: string
  count: number
  last_seen_at?: string | null
}

export interface ConsoleSeed {
  op: ConsoleOp
  path: string
  meta: string
}

export const RUNNER_MODEL_LABELS = ["Local LM Studio", "google/gemma-3-4b"] as const

const OPS: ConsoleOp[] = ["fetch", "parse", "embed", "index"]

export function buildConsoleSeeds(companies: ConsoleCompany[]): ConsoleSeed[] {
  const realCompanies = companies
    .map((company) => ({
      ...company,
      name: company.name.trim(),
    }))
    .filter((company) => company.name.length > 0 && company.count > 0)

  if (!realCompanies.length) {
    return [{ op: "fetch", path: "tracked company feed", meta: "syncing" }]
  }

  return realCompanies.slice(0, 24).map((company, index) => ({
    op: OPS[index % OPS.length],
    path: company.name,
    meta: `${company.count.toLocaleString()} ${company.count === 1 ? "job" : "jobs"} - ${formatLastSeen(company.last_seen_at)}`,
  }))
}

function formatLastSeen(value?: string | null): string {
  if (!value) return "tracked"
  const date = value.trim().slice(0, 10)
  return date ? `scraped ${date}` : "tracked"
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd frontend && npx tsx --test tests/intel-console-model.test.ts`

Expected: pass.

### Task 3: Wire Hero To Real Analytics

**Files:**
- Modify: `frontend/components/public/intel/intel-hero.tsx`
- Modify: `frontend/components/public/intel-pane.tsx`
- Modify: `frontend/components/public/intel/intel-data.ts`

- [ ] **Step 1: Remove `LOG_SEEDS` import and use generated console seeds**

In `intel-hero.tsx`, import `buildConsoleSeeds`, `RUNNER_MODEL_LABELS`, and related types from `./intel-console-model`. Extend `HeroProps` with:

```ts
consoleCompanies?: ConsoleCompany[]
```

Pass `consoleCompanies` into `Console`.

- [ ] **Step 2: Render model chips**

Replace the static `gpt-oss-120b` header suffix with:

```tsx
<span className="tm-intel-console-models">
  {RUNNER_MODEL_LABELS.map((model) => (
    <span className="tm-intel-console-model" key={model}>{model}</span>
  ))}
</span>
```

- [ ] **Step 3: Pass analytics companies from `IntelPane`**

In the unauthenticated `IntelHero` call:

```tsx
consoleCompanies={analytics?.by_company ?? []}
```

- [ ] **Step 4: Remove fake company `LOG_SEEDS` from `intel-data.ts`**

Delete the `LogSeed`, `LogOp`, and `LOG_SEEDS` exports from `intel-data.ts`.

### Task 4: Source Contract Test

**Files:**
- Modify: `frontend/tests/layout-intel-contract.test.mjs`

- [ ] **Step 1: Add source checks**

```js
test("intel console is backed by tracked companies, not fake URL seeds", () => {
  const heroSource = read("components/public/intel/intel-hero.tsx")
  const paneSource = read("components/public/intel-pane.tsx")
  const dataSource = read("components/public/intel/intel-data.ts")

  assert.ok(heroSource.includes("buildConsoleSeeds"))
  assert.ok(heroSource.includes("RUNNER_MODEL_LABELS"))
  assert.ok(paneSource.includes("consoleCompanies={analytics?.by_company ?? []}"))
  assert.doesNotMatch(dataSource, /LOG_SEEDS/)
  assert.doesNotMatch(heroSource, /Last commit/)
})
```

- [ ] **Step 2: Run focused frontend tests**

Run: `cd frontend && node --test tests/layout-intel-contract.test.mjs && npx tsx --test tests/intel-console-model.test.ts`

Expected: all pass.

### Task 5: Verification And Commit

**Files:**
- All files touched above.

- [ ] **Step 1: Run type and lint checks**

Run:

```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
git diff --check
```

Expected: all clean.

- [ ] **Step 2: Commit only this task's files**

Run:

```bash
git add docs/superpowers/specs/2026-06-27-public-intel-runner-tracked-companies-design.md docs/superpowers/plans/2026-06-27-public-intel-runner-tracked-companies.md frontend/components/public/intel/intel-console-model.ts frontend/components/public/intel/intel-data.ts frontend/components/public/intel/intel-hero.tsx frontend/components/public/intel-pane.tsx frontend/components/public/intel-pane.css frontend/tests/intel-console-model.test.ts frontend/tests/layout-intel-contract.test.mjs
git commit -m "fix(intel): ground runner console in tracked companies"
```
