# Myro Design System
### Color · Contrast · Theme · Typography · Layout · v1.0 · 2026-05-28

Companion to [DESIGN_CONSTITUTION.md](DESIGN_CONSTITUTION.md) (5 interaction
rules) and [BRAND_TYPOGRAPHY_AUDIT.md](BRAND_TYPOGRAPHY_AUDIT.md) (type
philosophy). This doc covers **what makes a surface readable**: contrast,
theme token rules, typography scale, layout grid. Every UI PR is expected
to honour these alongside the Constitution.

Single source of truth in code: [`frontend/app/design-tokens.css`](../frontend/app/design-tokens.css).
This doc explains the rules the tokens encode.

---

## 1 · Color & Contrast

### 1.1 WCAG floor

Every text token MUST pass against the surface it renders on.

| Use | Min ratio | Rule |
|---|---|---|
| Body text (<18px or <14px bold) | **4.5:1** (AA) | Always required |
| Large text (≥18px or ≥14px bold) | **3:1** (AA Large) | Always required |
| Primary headings, key narrative | **7:1** (AAA) | Strongly preferred |
| Decorative only — separators, divider icons, ghost numerals | <3:1 allowed | Token MUST be named `*-disabled` and MUST NOT convey meaning |

Measure ratios with the standard WCAG formula on the actual rendered surface
(not just page bg — check card surfaces too).

### 1.2 Text token semantics

Four tiers, identical names across themes. Pick by meaning, never by "what looks right":

| Token | Use | Dark on `#050A18` | Light on `#F4F6FA` |
|---|---|---|---|
| `--tm-text` | Primary content — body copy, headings, form values | `#E8F0FF` · ~16.8:1 (AAA) | `#050A18` · ~16.6:1 (AAA) |
| `--tm-text-muted` | Secondary content — labels, captions, metadata that still must be readable | `#94A3C2` · ~8.5:1 (AAA) | `#3F4D6A` · ~8.9:1 (AAA) |
| `--tm-text-faint` | Tertiary content — timestamps, separators with text, footnotes | `#6C7A98` · ~5.1:1 (AA) | `#6F7B95` · ~4.6:1 (AA) |
| `--tm-text-disabled` | Decorative ONLY — ghost numerals, faint separators, visual rhythm | `#3A4560` · ~2.0:1 | `#A8B0C2` · ~2.4:1 |

**Anti-rule:** never use `--tm-text-disabled` for content the user needs to read.
TOC numbers, helper text, breadcrumbs, footer links, sidebar nav — all conveying
information — use `--tm-text-faint` or stronger.

### 1.3 Surface wash tokens

Surface tints (hover/active backgrounds) MUST be **alpha cyan**, never solid OKLCH
high-lightness values. A solid 92% lightness teal on dark bg = blinding wash that
kills text contrast.

Dark theme (transparent overlays on `#050A18`):
```css
--tm-int-bg-subtle: rgba(0, 245, 212, 0.04);   /* very subtle hover */
--tm-int-bg-wash:   rgba(0, 245, 212, 0.10);   /* active/selected tint */
--tm-int-bg-hover:  rgba(0, 245, 212, 0.16);   /* stronger hover */
```

Light theme uses deeper teal alpha for AA on white:
```css
--tm-int-bg-subtle: oklch(0.46 0.13 185 / 0.04);
--tm-int-bg-wash:   oklch(0.46 0.13 185 / 0.08);
--tm-int-bg-hover:  oklch(0.46 0.13 185 / 0.14);
```

The `--int-01..09` OKLCH ramp is solid-color and is reserved for **borders,
text, and solid fills** — never surface backgrounds. Solid 92% L teal applied
as a `background` on dark theme is the bug pattern that bit us 2026-05-23
and again 2026-05-28; do not repeat it.

### 1.4 Accent + status colors

Single accent — teal (#00F5D4 dark / oklch(0.46 0.13 185) ≈ #00A88F light).
Used for: interactive (links, buttons, focused inputs), score/progress bars,
selected state.

Status colors are signals, never decoration:

| Token | Meaning |
|---|---|
| `--tm-success` (green) | Confirmed positive — score went up, application accepted, save complete |
| `--tm-warning` (amber) | Attention needed — quota near limit, score plateauing |
| `--tm-danger` (red) | Negative or destructive — error, delete, score dropped, application rejected |
| `--tm-info` (violet) | Neutral notice — applied stage, system message, advisory |

Myrology (the cosmic sub-brand at `/myrology`) is the ONLY surface allowed to
use amethyst (`--my-amethyst`). It never bleeds into the core product.

---

## 2 · Theme — Dark · Light · System

### 2.1 Modes

| `data-surface` | Use |
|---|---|
| (default) | Dark — Ghost surface, near-black page, the product feel |
| `light` | Light — Spirit surface, cool off-white, daylight clarity |

System default = `prefers-color-scheme` per E9 lock. User override persists
in `localStorage["myro_surface_v1"]` via `<SurfaceToggle>`.

### 2.2 Contract — both themes MUST satisfy

For every UI surface:

- Every text node passes WCAG AA against the rendered card/page bg
- Every hover/active background is a tint, never an opaque solid that hides text
- Focus rings remain visible — never the same color as the surface
- Status colors stay distinguishable to deutan/protan-colorblind viewers (don't rely on hue alone — add an icon or text label)

### 2.3 Light theme is not "just dark inverted"

`--tm-interactive-glow` on dark = a true halo (40% alpha bright cyan).
`--tm-interactive-glow` on light = a **shadow cast** (oklch 0.46 0.13 185 / 0.18),
not a glow. White paper doesn't glow. It casts.

Component CSS should NOT hardcode hex or rgba. Always consume tokens so the
theme switch is automatic.

### 2.4 Anti-rule list

- ❌ Hardcoded `#FFFFFF` foreground anywhere — breaks on light theme
- ❌ Hardcoded `#0xx` bg anywhere — breaks on light theme
- ❌ `rgba(0, 245, 212, …)` literal bright cyan — breaks on light theme (use `var(--tm-int-bg-wash)`)
- ❌ Solid OKLCH high-lightness as background — blinding (use alpha tokens)
- ❌ Same color for surface bg and focus ring — invisible focus

---

## 3 · Typography

See [BRAND_TYPOGRAPHY_AUDIT.md](BRAND_TYPOGRAPHY_AUDIT.md) for philosophy.
This section is the codified token reference + rules.

### 3.1 Voice split

Two families. Pick by intent.

| Family | Token | Use |
|---|---|---|
| Editorial / display | `--tm-font-display` (Source Serif 4) | Brand wordmark, section headlines, high-trust narrative, premium moments |
| Product / UI | `--tm-font-sans` (Inter / Plus Jakarta) | Nav, controls, filters, tables, dense intel surfaces, body |
| Mono | `--tm-font-mono` (Geist Mono) | Tabular numbers, code, log lines, timestamps |

Geist + Instrument Serif are accent fonts in specific pages (Live Career Intel
hero `em` accents, commons header) — they earn their place by being rare.

### 3.2 Size scale

| Token | Desktop | Mobile | Use |
|---|---|---|---|
| `--tm-fs-hero` | 82px | 54px | Marketing hero only |
| `--tm-fs-display` | 50px | 38px | Page H1 (CV Hub, Live Career Intel, Privacy) |
| `--tm-fs-title` | 34px | 28px | Section H2 |
| `--tm-fs-heading` | 24px | 20px | Card titles, modal heads |
| `--tm-fs-body` | 19px | 17px | Paragraphs, primary content |
| `--tm-fs-meta` | 17px | 15px | Form labels, meta rows |
| `--tm-fs-caption` | 15px | 13px | Captions, timestamps, footnotes |

**Anti-rule:** 11px and 12px are reserved for in-product UI chrome (badge text,
chip count). NEVER use them for first-time / public-facing trust copy. Per
BRAND_TYPOGRAPHY_AUDIT §"What was weak in Myro".

### 3.3 Weight + line-height rules

- Body copy weight: 400 (regular). 500 is the lift; never 600 for body.
- Headings: 600 by default. 700 is reserved for `tm-fs-display`+ display roles
  or accent moments.
- Line-height tokens (`--tm-lh-*`) MUST be paired with their size token. Don't
  freelance `line-height: 1.4`.
- Tabular numerals — every numeric value (score, count, money, time) sets
  `font-variant-numeric: tabular-nums` so columns align.

### 3.4 Tracking

| Use | Token |
|---|---|
| Display + title | `--tm-tracking-tight` (-0.02em) |
| Body | `--tm-tracking-normal` (0) |
| Meta labels | `--tm-tracking-meta` (0.005em) |
| Uppercase eyebrows / caps | `--tm-tracking-caps` (0.08em) |

Uppercase below 11px without `--tm-tracking-caps` is unreadable. The token is
not optional.

---

## 4 · Layout

### 4.1 Grid

- Base unit: **4px** (Tailwind default). All spacing/padding/margin/gap aligns to multiples of 4.
- Card padding: `var(--tm-card-pad)` = 24px
- Page horizontal: `var(--tm-page-px)` = 32px desktop, 16px mobile
- Page vertical: `var(--tm-page-py)` = 40px desktop, 24px mobile
- Max content width: `var(--tm-content-max)` = 80rem (1280px) for app, 1320px on the public Intel mirror

### 4.2 Surface elevation

| Token | Level |
|---|---|
| `--tm-bg` | Page floor (no shadow) |
| `--tm-surface` | Card (border + maybe `--tm-shadow-1`) |
| `--tm-surface-2` | Elevated / hovered card |
| `--tm-surface-3` | Modal / floating toolbar |

Each level steps up by exactly one tier — never skip. Borders carry elevation
on dark theme (subtle teal-blue glow); shadows carry elevation on light theme
(`--tm-shadow-2` cast).

### 4.3 Radii

| Token | Use |
|---|---|
| `--tm-radius-sm` (6px) | Chips, badges, micro-tags |
| `--tm-radius` (12px) | Cards, inputs, default controls |
| `--tm-radius-lg` (16px) | Elevated cards, hero panels |
| `--tm-radius-xl` (20px) | Modals |
| `--tm-radius-pill` (9999px) | Pills, toggles, status chips |

### 4.4 Breakpoints — single source

Only one breakpoint in JS + CSS — `--tm-bp-mobile: 768px`. Mobile = `max-width: 768px`. Desktop = `min-width: 769px`. JS mirror = [`lib/viewport.ts`](../frontend/lib/viewport.ts).

Sub-breakpoints (480px, 720px, 980px, 1100px) are page-scoped polish, never
global behaviour. Don't add to the root token list.

---

## 5 · Motion

| Token | Duration | Use |
|---|---|---|
| `--tm-dur-fast` | 120ms | Hover state shifts, color transitions |
| `--tm-dur` | 200ms | Default UI — open/close, focus, micro-anim |
| `--tm-dur-slow` | 380ms | Score bars, XP fills, drawers |
| `--tm-dur-page` | 380ms | Page enter |

Easing: `--tm-ease: cubic-bezier(0.16, 1, 0.3, 1)` (smooth out-quint) for arrivals.

`prefers-reduced-motion: reduce` — animations clamp to ~0ms. Test every new
component with the OS toggle on.

---

## 6 · Z-index — fixed scale

```
--z-base:     0
--z-raised:   10
--z-nav:      100
--z-modal:    300
--z-toast:    400
--z-progress: 200
```

Never arbitrary values (`z-index: 9999` is a code smell — promote to a token
or move the component out of the z-index battle).

---

## 7 · Component-scoped CSS pattern (ADR-0003)

For non-trivial components, a sibling `.css` file is loaded by the component
itself, classes prefixed `tm-<component>-*`. Examples:
[`domain-accordion-row.css`](../frontend/components/skills/domain-accordion-row.css),
[`forge-xp-pill.css`](../frontend/components/forge/forge-xp-pill.css),
[`intel-pane.css`](../frontend/components/public/intel-pane.css),
[`cv-builder.css`](../frontend/app/cv/cv-builder.css).

Rule: inline styles are OK for one-off layout (≤3 properties) but anything
stateful (hover/focus/active/disabled) or motion belongs in a scoped CSS file
so it survives reduced-motion + theme switching.

---

## 8 · Checklist for every UI PR

Append to PR description alongside the Constitution check:

```
Design system check:
  [ ] All text passes WCAG AA on its rendered surface (light + dark)
  [ ] No hardcoded #hex foreground/background — all tokens
  [ ] Hover/active backgrounds use --tm-int-bg-* (alpha cyan) not solid OKLCH
  [ ] Numerals use font-variant-numeric: tabular-nums
  [ ] Type sizes pulled from --tm-fs-* tokens, not freelance px
  [ ] Component tested with prefers-reduced-motion: reduce
  [ ] Component tested with data-surface="light" AND default dark
```

If any check fails, fix tokens first then re-run. Do not exception your way
through.

---

## 9 · Skills for design exploration

When a module needs a real visual rethink (not just a token fix):

- **`/design-an-interface`** — spawns parallel sub-agents to explore multiple
  radically different shapes for the same module before you pick. Use when
  picking the interface itself is the open question.
- **`/canvas-design`** — assembles design artifacts on a canvas for visual
  comparison. Use when you have several variants and want to evaluate side-by-side.
- **`/frontend-design`** — production-grade implementation pass on a chosen
  design. Use when the design is locked and you need a high-quality build.
- **`/baseline-ui`** — audit-only sweep for animation/typography/accessibility
  drift across the codebase.
- **`/fixing-accessibility`** — targeted ARIA/keyboard/focus/contrast pass.

These complement the token system; they don't replace it. Tokens enforce the
floor (AA, theme-safe). Skills produce the ceiling (great design choices).

---

## Amendments log

- **2026-05-28 · v1.0** initial draft. Triggered by the dark-theme TOC contrast
  failure on `/privacy` (`--tm-text-faint` at 2.0:1) and the hover-wash
  blinding issue on `/intel` (`--tm-int-bg-wash` solid 92% lightness OKLCH).
  Token values lifted to AA across both themes; surface washes decoupled
  from the int ramp.
