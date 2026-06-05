# Brand System Supersession Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Myro brand-system supersession across tokens, public landing/nav, app chrome, and first-run/home surfaces.

**Architecture:** Make `frontend/app/design-tokens.css` the new source of truth for the superseding brand values, then update global shell CSS and scoped high-impact surfaces to consume those tokens. Use a source-level regression test to lock the contract, then browser QA to verify real rendered spacing, typography, and responsive behavior.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS, Base UI button primitive, Node test runner, Browser plugin for rendered QA.

---

### Task 1: Brand Contract Regression Test

**Files:**
- Create: `frontend/tests/brand-system.test.ts`
- Modify later: `frontend/app/design-tokens.css`, `frontend/app/layout.tsx`, `frontend/app/globals.css`, `frontend/components/ui/button.tsx`, selected scoped CSS files

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/brand-system.test.ts` with source assertions that lock the approved spec:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()
const read = (path: string) => readFileSync(join(frontendRoot, path), "utf8")

test("brand tokens implement the superseding light and dark palettes", () => {
  const tokens = read("app/design-tokens.css")

  assert.match(tokens, /--tm-bg:\s*#050505/)
  assert.match(tokens, /--tm-surface:\s*#101010/)
  assert.match(tokens, /--tm-text:\s*#F7F7F7/)
  assert.match(tokens, /--tm-interactive:\s*#12BFA5/)
  assert.match(tokens, /:root\[data-surface="light"\]\s*{[\s\S]*--tm-bg:\s*#F9F9F9/)
  assert.match(tokens, /:root\[data-surface="light"\]\s*{[\s\S]*--tm-text:\s*#262626/)
  assert.match(tokens, /:root\[data-surface="light"\]\s*{[\s\S]*--tm-interactive:\s*#FF4C00/)
})

test("layout defaults to light mode and uses Inter as the core font", () => {
  const layout = read("app/layout.tsx")

  assert.match(layout, /Inter/)
  assert.doesNotMatch(layout, /Plus_Jakarta_Sans/)
  assert.doesNotMatch(layout, /Source_Serif_4/)
  assert.match(layout, /data-surface="light"/)
  assert.doesNotMatch(layout, /prefers-color-scheme:\s*dark/)
})

test("global rhythm exposes separate desktop and phone contracts", () => {
  const tokens = read("app/design-tokens.css")
  const globals = read("app/globals.css")

  assert.match(tokens, /--tm-page-px:\s*32px/)
  assert.match(tokens, /--tm-mobile-page-px:\s*16px/)
  assert.match(tokens, /--tm-desktop-nav-h:\s*60px/)
  assert.match(tokens, /--tm-mobile-topbar-h:\s*56px/)
  assert.match(tokens, /--tm-mobile-bottomnav-h:\s*64px/)
  assert.match(globals, /height:\s*calc\(var\(--tm-mobile-topbar-h\)/)
  assert.match(globals, /height:\s*calc\(var\(--tm-mobile-bottomnav-h\)/)
})

test("button primitive uses the superseding radius and theme-specific CTA tokens", () => {
  const button = read("components/ui/button.tsx")

  assert.match(button, /rounded-\[var\(--tm-button-radius\)\]/)
  assert.match(button, /bg-\[var\(--tm-interactive\)\]/)
  assert.doesNotMatch(button, /rounded-\[var\(--tm-radius\)\]/)
})

test("high-impact CSS no longer imports decorative one-off display fonts", () => {
  const mission = read("app/(authed)/home/mission-control.css")
  const firstRun = read("components/home/first-run-hero.css")

  assert.doesNotMatch(mission, /fonts\.googleapis\.com/)
  assert.doesNotMatch(mission, /Instrument Serif/)
  assert.doesNotMatch(firstRun, /font-serif|Georgia/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd frontend && npx tsx --test tests/brand-system.test.ts
```

Expected: FAIL because the current system still uses dark/navy defaults, Plus Jakarta/Source Serif, teal light CTAs, old nav heights, and serif/Google imports in home CSS.

- [ ] **Step 3: Commit nothing**

This task ends with a failing test only. Do not commit until the first green implementation task completes.

### Task 2: Supersede Tokens, Font Setup, And Theme Default

**Files:**
- Modify: `frontend/app/design-tokens.css`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1: Update font setup**

Replace `Plus_Jakarta_Sans` and `Source_Serif_4` with Next's `Inter` in `frontend/app/layout.tsx`. Keep one variable, `--font-sans`, and remove the system-dark default from `SURFACE_INIT`.

Expected behavior:

```ts
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
})
```

The init script should only honor explicit stored `light` or `dark`; invalid or absent storage resolves to `light`.

- [ ] **Step 2: Replace core token values**

Update `frontend/app/design-tokens.css` so root dark tokens use true black/teal and light tokens use the approved white/orange values. Add rhythm aliases:

```css
--tm-button-radius: 10px;
--tm-panel-radius: 6px;
--tm-panel-radius-lg: 8px;
--tm-mobile-page-px: 16px;
--tm-mobile-page-py: 20px;
--tm-desktop-nav-h: 60px;
--tm-desktop-nav-item-h: 36px;
--tm-mobile-topbar-h: 56px;
--tm-mobile-bottomnav-h: 64px;
```

Remove serif display from the core font token:

```css
--tm-font-sans: var(--font-sans), Inter, ui-sans-serif, system-ui, sans-serif;
--tm-font-display: var(--tm-font-sans);
```

- [ ] **Step 3: Update global page background and mobile rhythm**

In `frontend/app/globals.css`, remove decorative radial/grid backgrounds from the default body treatment and update mobile topbar/bottomnav heights to the new rhythm tokens.

- [ ] **Step 4: Run green check for brand contract**

Run:

```bash
cd frontend && npx tsx --test tests/brand-system.test.ts
```

Expected: still may fail on button/home CSS assertions until later tasks, but palette/font/default/rhythm assertions should pass.

### Task 3: Standardize Buttons, Public Nav, And App/Mobile Chrome

**Files:**
- Modify: `frontend/components/ui/button.tsx`
- Modify: `frontend/components/public/public-nav.css`
- Modify: `frontend/app/globals.css`
- Modify if needed: `frontend/mobile/shell.tsx`
- Modify if needed: `frontend/components/shell/web-chrome.tsx`

- [ ] **Step 1: Update button primitive**

Use `rounded-[var(--tm-button-radius)]` for `md` and `lg` sizes and keep `rounded-[var(--tm-radius-sm)]` only for small/icon controls. Keep colors token-driven.

- [ ] **Step 2: Standardize desktop nav rhythm**

Set desktop nav heights, item heights, gaps, and active states to token values:

```css
height: var(--tm-desktop-nav-h);
min-height: var(--tm-desktop-nav-h);
height: var(--tm-desktop-nav-item-h);
border-radius: var(--tm-panel-radius);
```

Public and authed nav should use the same proportions.

- [ ] **Step 3: Standardize phone nav rhythm**

Use `--tm-mobile-topbar-h`, `--tm-mobile-bottomnav-h`, and `44px` minimum touch targets. Remove the rounded floating bottom-nav sheet effect from core Myro mobile chrome.

- [ ] **Step 4: Accessibility pass for changed controls**

Confirm icon-only controls still have accessible names, focus rings remain visible, native buttons remain buttons, and color alone is not the only active-state signal.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd frontend && npx tsx --test tests/brand-system.test.ts tests/tokens-copy.test.ts tests/nav-first-run.test.ts
```

Expected: PASS for brand contract portions touched so far; if home CSS assertions still fail, continue to Task 4.

### Task 4: Clean Landing, First-Run, And Home Surfaces

**Files:**
- Modify: `frontend/components/public/landing-page.css`
- Modify: `frontend/components/home/first-run-hero.css`
- Modify: `frontend/app/(authed)/home/mission-control.css`
- Modify if needed: `frontend/components/home/*.tsx`

- [ ] **Step 1: Landing page**

Replace teal-first light styling with tokenized orange CTAs, Inter type, standard panel/button radii, and desktop/mobile spacing tokens. Remove decorative glows that make the light theme feel playful.

- [ ] **Step 2: First-run hero**

Remove serif/italic headline treatment and clamp-based viewport font sizing. Use page title/section title tokens and `--tm-button-radius`. Keep upload CTA dominant.

- [ ] **Step 3: Mission Control**

Remove Google font import and Instrument Serif usage. Replace local one-off page padding, nav/tool gaps, heading sizes, and score typography with the desktop/phone rhythm tokens.

- [ ] **Step 4: Run full focused frontend checks**

Run:

```bash
cd frontend && npx tsx --test tests/brand-system.test.ts tests/tokens-copy.test.ts tests/pr5-display-fixes.test.tsx tests/nav-first-run.test.ts
cd frontend && npx tsc --noEmit
cd frontend && npx next lint
```

Expected: all pass.

### Task 5: Browser QA And Final Verification

**Files:**
- No source files unless QA reveals defects.

- [ ] **Step 1: Start frontend dev server**

Run:

```bash
cd frontend && npm run dev
```

Use an available local port if the default is busy.

- [ ] **Step 2: Browser plugin desktop QA**

Flow under test: `/` loads -> public landing/nav render in default light mode -> primary CTA/navigation use the new orange/spacing/type system.

Check page identity, nonblank content, no framework overlay, console health, screenshot evidence, and at least one nav/CTA interaction.

- [ ] **Step 3: Browser plugin mobile QA**

Set a 375px-wide viewport. Check no horizontal overflow, phone rhythm, nav/topbar/bottom spacing, readable type, and no clipped primary content.

- [ ] **Step 4: Dark-mode QA**

Toggle dark mode through the UI or localStorage and reload. Confirm true black base and teal important states, not navy.

- [ ] **Step 5: Final verification**

Run:

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx next lint
cd frontend && npx tsx --test tests/brand-system.test.ts tests/tokens-copy.test.ts tests/pr5-display-fixes.test.tsx tests/nav-first-run.test.ts
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Update cockpit summary and commit**

Update `AGENTS.md` Last Session Summary with implementation and validation. Commit with:

```bash
git add AGENTS.md frontend/app/design-tokens.css frontend/app/layout.tsx frontend/app/globals.css frontend/tailwind.config.ts frontend/components/ui/button.tsx frontend/components/public/public-nav.css frontend/components/public/landing-page.css frontend/components/home/first-run-hero.css frontend/app/\(authed\)/home/mission-control.css frontend/tests/brand-system.test.ts docs/superpowers/plans/2026-06-05-brand-system-supersession-implementation.md
git commit -m "feat(brand): standardize Myro visual system"
```

If additional files are intentionally changed during QA, include them in the same commit and mention them in the final response.
