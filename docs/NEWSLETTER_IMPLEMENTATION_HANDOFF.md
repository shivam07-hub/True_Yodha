# Newsletter + Privacy Visibility — Claude Code Handoff

**From:** planning session, 2026-05-02
**To:** next Claude Code session
**Owner of execution:** Claude Code (this repo)
**Estimated scope:** 4 phases, 1 session each, all on `Develop` branch

---

## 1. Mission in one paragraph

Build a public Newsletter surface (`/newsletter`, `/newsletter/[slug]`) that doubles as the SEO acquisition channel described in `Myro Newsletter/Myro - SEO Sales Engine Playbook.md`. Make the existing `/privacy` page reachable from public chrome (currently orphaned). Convert `/` from a forced login redirect into a real public landing page with Login / Sign up / Newsletter / Privacy in a top-bar nav. Issue MDX content lives in the separate `Myro Newsletter/` folder (single source of truth) and is materialized into `frontend/content/newsletter/` via a sync script so Vercel can build it.

---

## 2. Locked decisions (do NOT reopen)

| # | Decision | What it means |
|---|---|---|
| **1** | **Top-bar nav on Intel pane (Option B)** | The right-hand Intel pane on `/login` (and on the new public landing) gets a top-bar containing: `Intel · Newsletter · Privacy · Sign up`. Not a sidebar link. |
| **2** | **Inline footer band on /login and /signup (Option P2)** | A thin row at the bottom of `/login` and `/signup`: `Privacy · Newsletter · © Myro 2026`. |
| **3** | **MDX-in-repo (Option N1)** | Issues are `.mdx` files. No CMS. No Supabase newsletter table. |
| **4** | **URL & IA structure** | `/newsletter` (index), `/newsletter/[slug]` (issue), `/newsletter/rss.xml`, `/newsletter/feed.json`. Slug pattern: `2026-04-ai-hiring-heatmap`. Pillar pages `/careers/*` deferred to Phase N5. |
| **5** | **Convert `/` into public landing (Option R2)** | `/` is no longer a redirect. New `app/page.tsx` is the public landing. Login form moves exclusively to `/login`. |
| **6** | **Content sync model** | Source of truth: `Myro Newsletter/`. Local dev: symlink. Vercel: committed mirror at `frontend/content/newsletter/` produced by `scripts/sync-newsletter.ts` (see §6 — flagged concern). |

---

## 3. Concern flagged before you start (read this first)

The user's stated intent: "newsletter issue files live in `Myro Newsletter/` with a symlink at `True_Yodha/frontend/content/newsletter/` to prevent drifting."

**Symlink alone will not work on Vercel.** Vercel clones only the `True_Yodha` repo. A symlink whose target is `../../Myro Newsletter` resolves to nothing in the build sandbox. The build will fail or render an empty newsletter index.

**Resolution (already chosen, implement as below):**

- `frontend/content/newsletter/` is a **real, committed directory** that contains the MDX files Vercel reads.
- `Myro Newsletter/issues/` (note: create the `issues/` subfolder during Phase N3) is the **canonical authoring location**.
- `scripts/sync-newsletter.ts` copies `*.mdx` from `Myro Newsletter/issues/` → `frontend/content/newsletter/issues/` and is the **only** way new content arrives in `frontend/content/`. Manual edits to `frontend/content/newsletter/` are forbidden (enforced by a CI parity check).
- A local-dev convenience symlink may live at `frontend/content/newsletter/.source -> ../../../Myro Newsletter` (gitignored). Editors / IDEs can use it for navigation, but the build path is the committed copy.
- Author workflow: edit MDX in `Myro Newsletter/issues/` → run `pnpm newsletter:sync` → commit both folders → push → Vercel deploys. The CI parity check (`scripts/check-newsletter-sync.ts`) fails the build if `frontend/content/newsletter/issues/` is out of sync with `Myro Newsletter/issues/`, which prevents the drift the user is worried about.

If you decide this is too clever and want to propose a git submodule instead during Phase N2, do so as an inline question before you build — but ship something that works on Vercel either way.

---

## 4. Phase plan (one phase per session, smoke-tested before merge to `develop`)

Each phase is independent and shippable. Do not bundle them.

### Phase N1 — Public chrome + Privacy fix (smallest, ship first)

**Goal:** Privacy and Newsletter become visibly reachable from `/login` and `/signup` even though `/newsletter` doesn't exist yet — that's fine, the link can 404 until N2 lands. The privacy issue is closed in this phase.

**Files to touch:**

- `frontend/app/login/page.tsx` (already 590 lines — split if necessary, but at minimum add):
  - A top-bar nav strip on the right-hand Intel pane, above the existing market-summary header (around line 380, before the `marginBottom: 24` div). Items: `Intel` (active), `Newsletter` (link to `/newsletter`), `Privacy` (link to `/privacy`), `Sign up` (link to `/signup`).
  - A footer band at the very bottom of the `<main>` after the existing Signup CTA (around line 585): `Privacy · Newsletter · © Myro 2026`.
- `frontend/app/signup/page.tsx`:
  - Same top-bar nav strip and footer band as above.
- New file `frontend/components/public/top-nav.tsx` — extract the top-bar into a reusable component (`<PublicTopNav active="login|signup|newsletter|privacy" />`).
- New file `frontend/components/public/public-footer.tsx` — extract the footer band similarly.

**Component contract:**

```tsx
// top-nav.tsx
interface PublicTopNavProps {
  active?: "intel" | "newsletter" | "privacy" | "signup" | "login"
}
export function PublicTopNav({ active }: PublicTopNavProps): JSX.Element

// public-footer.tsx
export function PublicFooter(): JSX.Element  // renders: Privacy · Newsletter · © Myro 2026
```

**Style requirements:**

- Use `var(--tm-surface)`, `var(--tm-border-soft)`, `var(--tm-accent)` tokens — no hardcoded colors.
- Top bar height ~44px, sticky to top of the Intel pane (NOT the viewport — it should scroll inside the pane).
- 375px mobile viewport must work: top bar stays single row with horizontal scroll, footer wraps if needed.
- Active item gets `var(--tm-accent-wash)` background + `var(--tm-accent-ring)` border.

**Acceptance:**

- `/login` renders top-bar with all four links + footer band.
- `/signup` renders the same.
- Clicking `Privacy` from either page lands on `/privacy` (already exists at `frontend/app/privacy/page.tsx`).
- Clicking `Newsletter` lands on a 404 page (expected until N2).
- Lighthouse SEO ≥ 95 on `/login`, `/signup`, `/privacy`.
- `tsc --noEmit` clean. `next lint` clean.
- All new files ≤ 300 lines.

**Commit message:**
`feat(ui): public top-nav + footer band — newsletter & privacy reachable pre-login`

---

### Phase N2 — Newsletter scaffolding (wire the route, no content yet)

**Goal:** `/newsletter` renders an empty-state index. `/newsletter/[slug]` is wired but has no issues to render. MDX pipeline works end-to-end with a placeholder issue.

**Files to add:**

- `frontend/app/newsletter/layout.tsx` — public shell using `<PublicTopNav active="newsletter" />` + `<PublicFooter />`. Includes `Organization` JSON-LD on every newsletter route.
- `frontend/app/newsletter/page.tsx` — index page. Empty state for now: title, subtitle from the Playbook ("Free weekly hiring intel — no fluff"), and a placeholder grid that will fill from `getAllIssues()`.
- `frontend/app/newsletter/[slug]/page.tsx` — dynamic route. Uses `generateStaticParams()` to enumerate slugs from `frontend/content/newsletter/issues/`. Uses `generateMetadata()` to emit per-issue title/description/OG/JSON-LD.
- `frontend/lib/newsletter/index.ts` — utility module:
  ```ts
  export interface IssueFrontmatter {
    title: string
    slug: string
    publishedAt: string          // ISO date
    theme: "heatmap" | "skill" | "trajectory" | "boom-watch" | "future-of-work"
    primaryKeyword: string
    ctaRole: string              // e.g. "AI Engineer" — populates the inline CTA
    ogImage?: string
    summary: string              // ≤ 155 chars, used as meta description
    pillar?: "ai-careers" | "career-trajectories" | "career-switching" | "in-demand-skills"
  }
  export interface Issue extends IssueFrontmatter {
    content: string              // raw MDX body
  }
  export async function getAllIssues(): Promise<Issue[]>
  export async function getIssueBySlug(slug: string): Promise<Issue | null>
  ```
- `frontend/components/newsletter/issue-card.tsx` — index-page card.
- `frontend/components/newsletter/issue-cta.tsx` — `<NewsletterCTA role="…" issueSlug="…" />` component that links to `/signup?role={role}&utm_source=newsletter&utm_campaign={issueSlug}`.
- `frontend/app/sitemap.ts` — generate sitemap that includes all newsletter slugs (use existing if present, otherwise create).
- `frontend/app/robots.ts` — allow `/newsletter`, allow `/privacy`, disallow `/api/*`.
- `frontend/content/newsletter/issues/_placeholder.mdx` — one placeholder issue so the route resolves; deleted in N3.
- `frontend/content/newsletter/.gitkeep` and a `README.md` warning "DO NOT EDIT BY HAND — synced from Myro Newsletter/issues/ via scripts/sync-newsletter.ts."

**MDX dependency choice:**

Add the following to `frontend/package.json` `dependencies`:
- `@next/mdx@^14.2.35`
- `@mdx-js/loader@^3`
- `@mdx-js/react@^3`
- `gray-matter@^4` (for frontmatter parsing in `lib/newsletter/index.ts`)
- `remark-gfm@^4` (tables/strikethrough in MDX)

Update `frontend/next.config.js` (or `next.config.mjs`, whichever exists) to include the MDX webpack loader and `pageExtensions: ["ts", "tsx", "mdx"]`. If neither file exists, create `next.config.mjs`.

**SEO requirements (from the Playbook §"Page anatomy"):**

- Title tag: ≤ 60 chars, includes year + primary keyword. Build from frontmatter.
- Meta description: ≤ 155 chars, includes "free". Use frontmatter `summary`.
- Each issue page emits `Article` JSON-LD with `headline`, `datePublished`, `author`, `publisher`, `image`, `articleBody` (truncated).
- `BreadcrumbList` JSON-LD: Home → Newsletter → Issue.
- `Organization` JSON-LD on the newsletter layout.

**Plumb Decision-1B nav into the new public landing now too:**

- Replace `frontend/app/page.tsx` (currently `redirect("/login")`) with a real public landing page that:
  - Renders `<PublicTopNav active="intel" />` at the top.
  - Below the nav, renders the same Intel pane that's currently inside `/login` (extract the Intel JSX from `login/page.tsx` lines 376–586 into `frontend/components/public/intel-pane.tsx` and use it on both `/` and `/login`).
  - Has a "Sign in" button in the top-bar that links to `/login`.
  - Renders `<PublicFooter />` at the bottom.
- `/login` becomes a focused login form (the left-hand sidebar that already exists, plus the IntelPane reused for context).

**Acceptance:**

- `/newsletter` renders empty-state index with top-bar + footer.
- `/newsletter/_placeholder` (or whatever the placeholder slug is) renders the placeholder MDX with full SEO metadata visible in `view-source`.
- `/sitemap.xml` includes `/newsletter/_placeholder` and `/privacy`.
- `/robots.txt` resolves correctly.
- `/` renders new public landing, NO redirect.
- `tsc --noEmit` clean. `next lint` clean.
- All new files ≤ 300 lines.
- `frontend/app/page.tsx` change verified not to break authenticated users (check that `/home`, `/market`, etc. still redirect correctly).

**Commit messages (one per logical chunk):**
- `feat(deps): add MDX support for newsletter`
- `feat(newsletter): scaffold /newsletter index + dynamic [slug] route with MDX`
- `feat(seo): sitemap.ts + robots.ts including newsletter routes`
- `feat(ui): public landing at / replaces login redirect (Decision R2)`

---

### Phase N3 — Issue 001 publishing pipeline + sync script

**Goal:** Issue 001 is live at `/newsletter/2026-04-ai-hiring-heatmap`. The sync script works. The CI parity check works.

**Files to touch / add:**

- `Myro Newsletter/issues/` — create this subfolder. Move the existing `Myro Newsletter/Issue 001 - The April 2026 AI Hiring Heatmap.md` into `Myro Newsletter/issues/2026-04-ai-hiring-heatmap.mdx` and add frontmatter at the top:
  ```yaml
  ---
  title: "The April 2026 AI Hiring Heatmap"
  slug: "2026-04-ai-hiring-heatmap"
  publishedAt: "2026-04-28"
  theme: "heatmap"
  primaryKeyword: "AI hiring 2026"
  ctaRole: "AI Engineer"
  summary: "Free weekly hiring intel: where AI is actually hiring in April 2026, with role-by-role data."
  pillar: "ai-careers"
  ---
  ```
  Convert the markdown body to MDX-compatible (escape any literal `<` not in JSX, etc.).
- `True_Yodha/scripts/sync-newsletter.ts`:
  - Reads from absolute path `/Users/incognito/Myro Newsletter/issues/` (configurable via `NEWSLETTER_SOURCE_DIR` env var; default to relative `../Myro Newsletter/issues/` from repo root).
  - Copies all `*.mdx` to `frontend/content/newsletter/issues/`.
  - Validates each file: frontmatter parses, slug matches filename, slug matches frontmatter, required fields present.
  - Removes any `.mdx` file in destination that no longer exists in source.
  - Logs a manifest (file count, slugs, last modified).
  - Exits non-zero if validation fails.
- `True_Yodha/scripts/check-newsletter-sync.ts`:
  - Runs `sync-newsletter.ts` in dry-run mode.
  - Exits non-zero if it would change anything.
  - Used in CI and as a pre-commit hook.
- `True_Yodha/frontend/package.json` — add scripts:
  ```json
  "newsletter:sync": "tsx ../scripts/sync-newsletter.ts",
  "newsletter:check": "tsx ../scripts/check-newsletter-sync.ts",
  "prebuild": "npm run newsletter:check"
  ```
  Add `tsx` to devDependencies.
- `True_Yodha/.github/workflows/` (if exists) — add a step to run `newsletter:check`.
- Embed the dashboard charts: copy or reference the relevant HTML from `Myro Newsletter/Dashboards on jobs table/` into the issue. Two options:
  - (a) Create `frontend/components/newsletter/charts/` with React versions of dashboards 1–5 (preferred — server-rendered, lazy-loaded, no iframe SEO penalty).
  - (b) Inline as `<iframe srcDoc={...}>` in MDX (faster but worse for Lighthouse).
  Pick (a) if dashboard data is small enough; otherwise (b).
- Delete `frontend/content/newsletter/issues/_placeholder.mdx` from N2.

**SEO checklist for Issue 001 (run `marketing:seo-audit` skill):**

- H1 contains "AI Hiring" + "2026".
- TL;DR appears as `<ul>` near the top (featured-snippet bait).
- One H2 per ~200 words.
- ≥ 2 internal links (will need to be to other Myro pages since no other issues exist yet — link to `/market` and `/signup`).
- Inline `<NewsletterCTA role="AI Engineer" issueSlug="2026-04-ai-hiring-heatmap" />` after the body.
- `Article` JSON-LD validates against schema.org.
- OG image generated (start with the dashboard 1 screenshot — a real image asset committed to `frontend/public/og/2026-04-ai-hiring-heatmap.png`).

**Acceptance:**

- `/newsletter/2026-04-ai-hiring-heatmap` renders Issue 001 with all charts.
- `/newsletter` index lists Issue 001.
- CTA click round-trips: `/signup?role=AI%20Engineer&utm_source=newsletter&utm_campaign=2026-04-ai-hiring-heatmap`.
- `pnpm newsletter:sync` produces 0 diffs after a fresh edit-then-sync.
- `pnpm newsletter:check` exits 0 in clean state, 1 after manual edits to `frontend/content/newsletter/`.
- `marketing:seo-audit` returns all green for the issue page.
- `tsc --noEmit` clean. `next lint` clean.

**Commit messages:**
- `feat(newsletter): sync script + parity check (single source of truth in Myro Newsletter/)`
- `feat(newsletter): publish Issue 001 — April 2026 AI Hiring Heatmap`
- `feat(newsletter): React-rendered dashboard charts for Issue 001`

---

### Phase N4 — Author workflow + measurement

**Goal:** Posting a new issue takes < 60 seconds. Performance is measurable against the Day 30 / Day 90 targets in the Playbook.

**Files to add:**

- `True_Yodha/scripts/new-issue.ts` — interactive CLI:
  - Prompts for: theme (Mon=heatmap / Tue=skill / Wed=trajectory / Thu=boom-watch / Fri=future-of-work), title, primary keyword, CTA role.
  - Auto-derives: slug, publishedAt (today), summary placeholder.
  - Scaffolds `Myro Newsletter/issues/{slug}.mdx` with the section template from the Playbook §"Page anatomy".
- `True_Yodha/docs/NEWSLETTER_AUTHORING.md`:
  - Frontmatter spec (referenced from `lib/newsletter/index.ts`).
  - Slug naming rules.
  - Embedded chart pattern (which components to use).
  - Pre-publish checklist (run `marketing:seo-audit`, validate JSON-LD, confirm OG image).
  - Publish workflow (sync → commit → push).
- `True_Yodha/scripts/newsletter-feed.ts`:
  - Generates `frontend/public/newsletter/rss.xml` and `frontend/public/newsletter/feed.json` from `getAllIssues()`.
  - Wired into `prebuild`.
- Analytics: add pageview + CTA-click events to `<NewsletterCTA>`. If the project already uses an analytics provider, wire there; otherwise stub a `trackEvent(name, props)` in `frontend/lib/analytics.ts` and instrument it.
- `True_Yodha/docs/NEWSLETTER_METRICS.md`:
  - Day 30 / Day 90 targets from the Playbook reproduced.
  - Run `marketing:performance-report` skill to define the measurement query: which Supabase / analytics tables to read, weekly cadence, owner.

**Acceptance:**

- `pnpm new-issue` scaffolds a valid MDX file in `Myro Newsletter/issues/` in < 60s.
- `/newsletter/rss.xml` validates as RSS 2.0.
- `/newsletter/feed.json` validates as JSON Feed 1.1.
- CTA clicks emit a tracking event visible in the chosen analytics tool (or in console in dev).
- `tsc --noEmit` clean.

**Commit messages:**
- `feat(newsletter): new-issue scaffolding CLI`
- `feat(newsletter): RSS + JSON Feed generation`
- `feat(analytics): instrument newsletter CTA clicks`
- `docs(newsletter): authoring guide + metrics targets`

---

### Phase N5 (deferred) — Pillar pages

Not for this handoff. Spin up after ≥ 3 issues exist. Will involve `/careers/ai-roles-2026` and similar anchor pages per the Playbook §"Topic clusters".

---

## 5. Tests that must pass after each phase

Per the project's CLAUDE.md ABSOLUTE RULES:

- `pytest backend/tests` — should remain at current pass count (no backend changes in this handoff).
- `tsc --noEmit` from `frontend/` — must exit 0.
- `next lint` from `frontend/` — must exit 0 (no new errors).
- Manual smoke: `/`, `/login`, `/signup`, `/privacy`, `/newsletter`, `/newsletter/2026-04-ai-hiring-heatmap` (after N3) all render without console errors at 1440px and 375px.

---

## 6. What NOT to do

- Do not touch backend code. This is frontend + scripts only.
- Do not change the existing `AppShell` sidebar — that's authenticated chrome, not public chrome. Public chrome is the new `<PublicTopNav>` + `<PublicFooter>`.
- Do not add a CMS, Supabase table, or any DB-backed newsletter state. Decision N1 is locked.
- Do not commit anything in `frontend/content/newsletter/` by hand. Always go through the sync script.
- Do not delete `Myro Newsletter/Issue 001 - The April 2026 AI Hiring Heatmap.md` until Issue 001 is verified rendering at `/newsletter/2026-04-ai-hiring-heatmap` in production. Keep a `.bak` copy for the first deploy.
- Do not break the authenticated app. Run through the post-login flow (login → /home → /market → /tracker → /diary → /cv) once after N2 lands to confirm no regressions.

---

## 7. Open questions you may need to resolve mid-flight

1. **MDX vs. markdown-only.** If `@next/mdx` integration causes pain with App Router, fall back to `next-mdx-remote` (runtime MDX) — slightly worse SEO but simpler. Decide during N2.
2. **Chart embed strategy.** Decide in N3 between React-rendered (preferred) vs. iframe (faster). If the dashboard HTML files use unusual JS, iframe may be the only reasonable path for v1.
3. **Where does `Myro Newsletter/` live in production CI?** The user has it on their local machine only. For Vercel, the committed mirror at `frontend/content/newsletter/issues/` IS the production source. The sync script enforces parity; nothing on Vercel reads `Myro Newsletter/` directly.
4. **Author identity / E-E-A-T.** Playbook §"SEO must-haves" implies an author byline. Use "Shivam Pathak" as default author until otherwise specified; add to `Article` JSON-LD.

If any of these get blockers, stop and ask.

---

## 8. Reference materials

- `Myro Newsletter/Myro - SEO Sales Engine Playbook.md` — the strategy. Read in full before N2.
- `Myro Newsletter/Issue 001 - The April 2026 AI Hiring Heatmap.md` — the content to migrate in N3.
- `Myro Newsletter/Claude Design Brief - Issue 001.md` — visual treatment reference for issue pages.
- `Myro Newsletter/Dashboards on jobs table/dashboard{1..5}.html` — chart sources for Issue 001.
- `Myro Newsletter/queries/issue-001-heatmap.sql` — the data query behind the dashboards (do NOT re-run; the dashboards are the source of truth for chart visuals).
- `frontend/app/login/page.tsx` — current public-page reference. The Intel pane (lines 376–586) gets extracted into `<IntelPane>` in N2.
- `frontend/app/privacy/page.tsx` — already exists, already has SEO metadata. Just needs a public link to it.

---

## 9. Sign-off checklist before each `develop` push

- [ ] Conventional commit message
- [ ] All files ≤ 300 lines
- [ ] `tsc --noEmit` clean
- [ ] `next lint` clean
- [ ] `pnpm newsletter:check` clean (after N3)
- [ ] Manual smoke at 1440px and 375px
- [ ] Authenticated flow not broken (login → /home → /market still work)
- [ ] Updated `CLAUDE.md` "Last Session Summary" block before ending the session

---

End of handoff. Start with Phase N1.
