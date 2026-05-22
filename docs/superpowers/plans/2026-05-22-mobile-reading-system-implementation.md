# Mobile Reading System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Claude mobile wireframe direction across the logged-in Myro mobile web app while preserving backend-connected loops.

**Architecture:** Treat the Claude zip/screenshots as the accepted visual and UX spec, then map that system onto existing Next.js/TanStack Query screens instead of replacing them with static prototype data. Shared mobile reading tokens live in global CSS; screen-specific fixes stay in their existing page/component scopes.

**Tech Stack:** Next.js 14 App Router, React client components, Tailwind/shadcn-compatible CSS variables, TanStack Query, Zustand, FastAPI-backed API calls through `frontend/lib/api.ts`.

---

### Task 1: Mobile Shell And Reading Tokens

**Files:**
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/design-tokens.css`
- Modify: `frontend/mobile/shell.tsx`

- [ ] Add mobile reading aliases for page, surface, inset, text, accent text, border, and reading type sizes.
- [ ] Update the fixed mobile topbar and bottom nav to match the Claude shell: Mission, Intel, Skills, CV, Tracker.
- [ ] Keep nav routes backend-connected: `/home`, `/market`, `/skills`, `/cv`, `/tracker`.
- [ ] Ensure fixed bars respect safe-area insets and leave scroll content unobscured.

### Task 2: Signup Conversion Cleanup

**Files:**
- Modify: `frontend/components/auth/auth-form.tsx`

- [ ] Remove the signup-only ninja-name field from the signup form.
- [ ] Continue sending referral attribution through `myro_ref`.
- [ ] Keep backend signup connected through `auth.signup(email, password, "", referrer)`.
- [ ] Remove the background toggle from signup and keep only email, password, CTA, divider, Google, and sign-in link.
- [ ] Add referral surface when `?ref=` or stored referral exists.

### Task 3: Skills Overview And Skill Detail

**Files:**
- Modify: `frontend/app/skills/page.tsx`
- Modify: `frontend/app/skills/skills.css`
- Modify: `frontend/components/skills/domain-accordion-row.css`
- Modify: `frontend/components/skills/skill-card-inline.tsx`

- [ ] Replace the mobile stat line with a 2x2 stat grid backed by `scores.me()` and `users.mySkills()`.
- [ ] Keep the mobile Intel/Map/Audit segmented control in flow with a solid background and no overlap.
- [ ] Preserve domain accordion data and Skill Edit/Advice/Diary mutations.
- [ ] Make mobile skill actions icon-first under 480px while keeping `aria-label` and `title`.
- [ ] Add direct loop links from empty CV evidence to `/cv?skill=...`.

### Task 4: Intel Heatmap Mobile Reading Fix

**Files:**
- Modify: `frontend/app/market/page.tsx`

- [ ] Keep followed-company and per-company heatmap row queries unchanged.
- [ ] Stack heatmap heading, controls, and matrix on mobile.
- [ ] Replace rotated column labels on mobile with readable compact horizontal labels.
- [ ] Use em dash empty cells and preserve cell drill-down into `jobs.search`.
- [ ] Keep follow/unfollow XP cap/floor behavior intact.

### Task 5: CV Playground Mobile Score Loop

**Files:**
- Modify: `frontend/components/cv/builder/playground-view.tsx`
- Modify: `frontend/components/cv/builder/score-gauge.tsx`
- Modify: `frontend/components/cv/builder/intel-drawer.tsx`
- Modify: `frontend/app/cv/cv-builder.css`

- [ ] Fix JD-match score layout so number, percent, and label never overlap.
- [ ] Remove punitive negative-delta framing from mobile-facing summary.
- [ ] Add an action-oriented missing-skills loop into `/skills`.
- [ ] Preserve existing `jobId`, version selection, polish, save, export, and drawer behavior.

### Task 6: Verification And Session Closeout

**Files:**
- Modify: `AGENTS.md`

- [ ] Run `git diff --check`.
- [ ] Run frontend lint/build checks as practical.
- [ ] Use browser verification at 375px; if Browser/IAB is unavailable, use Playwright fallback.
- [ ] Inspect supplied concept screenshots and latest rendered screenshots with `view_image`.
- [ ] Update Last Session Summary in `AGENTS.md`.
- [ ] Commit the completed single-pass mobile redesign task.
