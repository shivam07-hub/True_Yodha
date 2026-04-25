# Spec — Sidebar Reorder + Frictionless CV-Optional Onboarding

**Date:** 2026-04-25
**Status:** Ready to implement (handoff for Claude Code)
**Owner:** Shivam
**Branch policy:** work on `develop`. Single feature commit per file group. Never merge to `main` directly.

---

## Why this exists

The product has shifted from "upload CV → see score → take action" to a market-first narrative: **see the market → target jobs → do the work → ship the CV → check yourself.** The sidebar order, the score block, and the onboarding flow all need to reflect this. We also want to drop the "you must upload a CV" gate — users without a CV can browse everything; CV-dependent surfaces show a consistent inline nudge instead of empty/blocked states.

Out of scope here: the milestone/CV-variant data-flow rewiring (Part 2 of the IA discussion). That gets its own spec.

---

## Goals

1. Reorder sidebar to: **Intel → Jobs → Progress → CV Builder → Dashboard.**
2. Score block reads only `MYRO SCORE` + the number. Drop the `Market position` subtitle.
3. Onboarding lets the user bail at any time via a gentle `×` close button (top-right, font-consistent).
4. Skipping onboarding is a first-class path. Users without a CV can browse every page.
5. Anywhere a feature genuinely depends on CV data, render a consistent `<CVRequiredNudge />` instead of an empty state or block. Wording, styling, and placement are uniform across pages.

## Non-goals

- No backend changes.
- No changes to the post-login redirect (`/market` stays — it still aligns; Intel is now the top of the sidebar so this is consistent).
- No changes to milestone / CV-variant wiring (Part 2 of the IA discussion).
- No new pages.

---

## Change set

### 1. `frontend/components/app-shell.tsx`

**a. Reorder `NAV_ITEMS`** (currently at line 18 area). Final order:

```ts
const NAV_ITEMS = [
  { href: "/market",    label: "Intel",      desc: "Market intelligence",      icon: "◉", nudge: false },
  { href: "/tracker",   label: "Jobs",       desc: "Matched roles + tracker",  icon: "◆", nudge: false },
  { href: "/diary",     label: "Progress",   desc: "Diary & achievements",     icon: "◑", nudge: true  },
  { href: "/cv",        label: "CV Builder", desc: "Your skill profile",       icon: "◈", nudge: false },
  { href: "/dashboard", label: "Dashboard",  desc: "Overview & analytics",     icon: "▣", nudge: false },
]
```

The pulsing accent dot ("Log today →") stays on Progress.

**b. Score block — drop the "Market position" subtitle.** At lines 1015–1018, remove the second `<div>`:

```diff
 <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, whiteSpace: "nowrap" }}>
   <div className="tm-label-caps" style={{ fontSize: 10 }}>Myro Score</div>
-  <div style={{ fontSize: 12, color: "var(--tm-text-muted)", marginTop: 2 }}>Market position</div>
 </div>
```

No other styling changes. The block already centers correctly with one line of label.

---

### 2. `frontend/app/onboarding/page.tsx` — gentle close button

In the header (the flex row with `Myro` brand + step dots, around line 82), insert an `×` close button to the right of the step dots.

**Behaviour:**
- Visible on every step **except** `score` (the score step is the success state — no need to escape from it).
- Click → `router.push("/market")` (matches post-login redirect; new top-of-nav).
- Routing must use `next/navigation`'s `useRouter` (already imported).

**Styling — must match the brand font scale:**
- Glyph: `×` (U+00D7), not the ASCII `x`.
- `font-family: var(--tm-font-sans)` (inherits from the header).
- `font-size: 22px`, `line-height: 1`, `font-weight: 300` (lighter than the brand mark — feels gentle).
- Color: `var(--tm-text-muted)`. On hover/focus: `var(--tm-text)` (no accent — accent is reserved for the brand mark and active CTA).
- 32×32 hit area, transparent background, no border.
- `border-radius: var(--tm-radius)`, `transition: color var(--tm-dur) var(--tm-ease)`.
- `aria-label="Skip onboarding"`.

Suggested JSX (inside the existing header `<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", … }}>`):

```tsx
<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
  {/* existing step dots */}
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {STEPS.map((s, i) => (
      <div key={s} style={{ width: 8, height: 8, borderRadius: "50%",
        background: i <= stepIndex ? "var(--tm-accent)" : "var(--tm-border)",
        transition: "background var(--tm-dur) var(--tm-ease)" }} />
    ))}
  </div>
  {step !== "score" && (
    <button
      type="button"
      onClick={() => router.push("/market")}
      aria-label="Skip onboarding"
      style={{
        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent", border: "none", cursor: "pointer",
        fontFamily: "var(--tm-font-sans)", fontSize: 22, lineHeight: 1, fontWeight: 300,
        color: "var(--tm-text-muted)", borderRadius: "var(--tm-radius)",
        transition: "color var(--tm-dur) var(--tm-ease)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-text)" }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-muted)" }}
    >
      ×
    </button>
  )}
</div>
```

Replace the existing step-dots wrapper with the structure above.

---

### 3. New component — `frontend/components/common/cv-required-nudge.tsx`

A single reusable inline nudge. Two visual variants (driven by a prop) so we can use the same component as a top-of-page banner *or* as the empty-state replacement in a card.

**Props:**

```ts
type CVRequiredNudgeProps = {
  variant?: "banner" | "block"   // default "banner"
  feature?: string               // e.g. "your job matches", "your Myro Score"
  className?: string
}
```

**Behaviour:**
- Renders nothing if the user already has a CV (caller passes a `hasCv` boolean *or* the component can `useAuth`/`useScore` to derive it — pick whichever matches existing patterns; if in doubt, take a `hasCv` prop and let callers wire it).
- Click → `router.push("/cv")`.

**Copy:**
- Banner: `Add your CV to unlock {feature}.` + button text `Upload CV →`.
- Block: `{feature, capitalised} needs your CV.` + a body line `Takes about 30 seconds. You can swap or remove it any time.` + button `Upload CV →`.
- Default `feature` if omitted: `personalised insights`.

**Styling tokens:**
- Banner: thin row, `padding: 10px 14px`, `background: var(--tm-accent-wash)`, `border: 1px solid var(--tm-accent-ring)`, `border-radius: var(--tm-radius)`, `color: var(--tm-text)`. Button uses `tm-btn-primary`.
- Block: card-like, `padding: 24px`, `background: var(--tm-surface)`, `border: 1px solid var(--tm-border-soft)`, centered text, button below.
- No hard-coded hex. All colour via `var(--tm-*)`.

**File size:** must stay <300 lines (project rule). Single file is fine.

---

### 4. Render the nudge on CV-dependent surfaces

For each page below: detect "no CV" via the existing score / profile fetch (whatever pattern that page already uses — if a page already 404s or shows skeletons when there's no score, replace that branch with the nudge).

| Page | Variant | Placement | `feature` copy |
|---|---|---|---|
| `app/market/page.tsx` (Intel) | `banner` | Top of the right detail pane (above company list) | `personalised market intel` |
| `app/tracker/page.tsx` (Jobs) | `banner` | Top of the page, above the matched-jobs grid | `your job matches` |
| `app/jobs/page.tsx` (full job list) | `banner` | Top of the page | `your job matches` |
| `app/diary/page.tsx` (Progress) | `banner` | Top of the page, above the timer | `personalised milestones` |
| `app/dashboard/page.tsx` | `block` | Replaces the Truth Score hero + radar when no CV; everything else (recent jobs, etc.) still renders below | `your Myro Score` |

CV Builder (`/cv`) does not get a nudge — it *is* the destination.

---

### 5. (Optional, if trivial) Remove first-run gates elsewhere

Search the frontend for any `if (!hasCv) redirect("/cv")` or `if (!score) router.push(...)` patterns and replace with the nudge. Likely candidates: `lib/hooks/use-auth.ts`, page-level guards in dashboard / market. **Do not** remove the auth gate (login still required); only remove CV gates.

---

## Acceptance criteria

1. `cd frontend && npx tsc --noEmit` → exit 0.
2. `cd frontend && npx next lint` → no warnings or errors.
3. Manual smoke (run the dev server, log in as a test user with **no CV uploaded**):
   - Sidebar order is Intel → Jobs → Progress → CV Builder → Dashboard.
   - Score pill shows only the number + `MYRO SCORE` label. No `Market position` subtitle.
   - Visit `/onboarding` from `/login` → `×` is visible on the CV step and Role step. Click `×` → routed to `/market`.
   - On `/market`, `/tracker`, `/jobs`, `/diary` — banner nudge visible at the top.
   - On `/dashboard` — block nudge replaces the score hero.
   - On `/cv` — no nudge.
4. Toggle Signal ↔ Forge: nudge component flips accent correctly (no hard-coded teal).
5. Repeat the smoke with a user **with CV uploaded**: nudges are absent everywhere.

## Commit plan (one feature, four commits)

1. `feat(ui): reorder sidebar (Intel→Jobs→Progress→CV→Dashboard)` — `app-shell.tsx` only.
2. `feat(ui): drop Market position subtitle on score pill` — `app-shell.tsx`.
3. `feat(onboarding): add gentle close button to escape onboarding` — `app/onboarding/page.tsx`.
4. `feat(ui): cv-required nudge + remove first-run CV gates` — new component + page wiring.

Push to `develop`; Vercel preview will auto-deploy. Smoke on the preview URL before any merge to `main`.

## Files touched (final list)

- `frontend/components/app-shell.tsx`
- `frontend/app/onboarding/page.tsx`
- `frontend/components/common/cv-required-nudge.tsx` (new)
- `frontend/app/market/page.tsx`
- `frontend/app/tracker/page.tsx`
- `frontend/app/jobs/page.tsx`
- `frontend/app/diary/page.tsx`
- `frontend/app/dashboard/page.tsx`
- (possibly) `frontend/lib/hooks/use-auth.ts` if a CV redirect lives there — keep the auth check, drop only the CV check.

## Notes for the implementer

- `var(--tm-font-sans)` is the canonical sans token; do not introduce new font families.
- All status semantics (success/warning/danger) stay separate from accent — the nudge uses accent because it's an *invitation*, not a status.
- File size cap: 300 lines per file. The new component will be ~80 lines; no risk.
- Don't add a "Skip" link in the onboarding *body*. The `×` is the only escape affordance — keeping the body focused.
