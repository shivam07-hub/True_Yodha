# Myro Brand System Supersession Design
### Light-default product standardization · 2026-06-05

## Status

Approved direction from Shivam on 2026-06-05.

This spec supersedes the existing Myro design system where there is a conflict
with color, typography, spacing, radius, button treatment, navigation rhythm,
and theme default behavior. Existing documents such as `docs/DESIGN_SYSTEM.md`
and `docs/CTA_DESIGN_SPEC.md` remain useful historical context, but the
implementation of this pass must treat this spec as the active source of truth.

The goal is not a decorative reskin. The goal is to make Myro feel like one
serious, text-first product instead of a collection of one-off surfaces.

## Locked Decisions

- Scope: brand tokens, public landing/nav, app chrome, and first-run/home.
- Light mode: default first impression for all visitors and users.
- Light brand: Firecrawl-like discipline with Myro adaptation.
- Light accent: orange primary actions, anchored on `#FF4C00`.
- Dark brand: true black base, white text, teal/green important states.
- Typography: Inter everywhere for this pass.
- Logo: keep the existing aperture-M mark; standardize usage only.
- Desktop web and phone web get separate rhythm contracts.
- Phone web rhythm becomes the visual seed contract for the future native APK.

## Supersession Rules

1. If old guidance says dark/system theme is the default, this spec wins:
   default surface is light.
2. If old guidance uses teal as the light-mode primary CTA, this spec wins:
   light primary actions are orange.
3. If old guidance uses Source Serif/serif display split, this spec wins:
   Inter is the only product and display family for core Myro.
4. If old guidance permits large radii, glows, decorative grids, or cyan washes
   across general surfaces, this spec wins: the core system is tighter and
   quieter.
5. If old page CSS hardcodes non-token spacing, type sizes, nav gaps, or button
   proportions, it must be replaced or mapped to the new rhythm tokens inside
   this pass's scope.

## Brand Foundation

Myro is a sober, text-first career intelligence product.

The interface should feel calm, structured, and confident. It should not feel
like a playful game layer, a glowing devtool, a crypto dashboard, or a generic
AI SaaS template. Because Myro is mostly text, the product quality is carried by
spacing, type, contrast, control sizing, and hierarchy.

### Light Surface

Light mode is the default.

| Role | Value | Usage |
|---|---:|---|
| Page | `#F9F9F9` | Main page background |
| Surface | `#FFFFFF` | Cards, panels, nav, modals |
| Surface muted | `#EFEFEF` | Secondary buttons, subtle fills |
| Border | `#E4E4E4` | Standard hairline borders |
| Border strong | `#D8D8D8` | Inputs, selected neutral controls |
| Text primary | `#262626` | Headings, body, nav |
| Text muted | `#5F5F5F` | Secondary copy |
| Text faint | `#7A7A7A` | Captions, timestamps |
| Primary accent | `#FF4C00` | Primary CTA, active important link |
| Primary hover | `#E64500` | Hover/pressed orange |

Light theme must not use teal for primary CTAs. Teal may appear only in data
visualization or success/positive semantics where orange would confuse meaning.

### Dark Surface

Dark mode is a deliberate user preference, not the default.

| Role | Value | Usage |
|---|---:|---|
| Page | `#050505` | Main dark background |
| Surface | `#101010` | Cards, panels, nav, modals |
| Surface raised | `#171717` | Elevated or selected panels |
| Border | `#242424` | Standard dark borders |
| Border strong | `#343434` | Inputs, selected neutral controls |
| Text primary | `#F7F7F7` | Headings, body, nav |
| Text muted | `#B9B9B9` | Secondary copy |
| Text faint | `#8F8F8F` | Captions, timestamps |
| Primary accent | `#12BFA5` | Primary CTA, active important link |
| Primary hover | `#18D6BA` | Hover/pressed teal |

Dark theme must not use navy as its base. Purple glow and decorative radial
lighting are out of scope for core Myro surfaces. Myrology can keep its own
sub-brand tokens.

## Typography

Inter is the only core Myro font family for this pass.

Suisse remains a future option only if licensed local font files are provided.
The implementation must not block on Suisse and must not use network-loaded
unlicensed Suisse.

### Font Roles

| Role | Family |
|---|---|
| Product UI | Inter, ui-sans-serif, system-ui, sans-serif |
| Display/headings | Inter, ui-sans-serif, system-ui, sans-serif |
| Mono/data | Existing mono stack, only for code, timestamps, compact data |

No serif display family in the core product. No decorative mono labels on public
marketing copy unless the content is genuinely data/code/status.

### Desktop Web Type Scale

| Token | Size | Line height | Weight | Usage |
|---|---:|---:|---:|---|
| Hero | 56px | 62px | 700 | Public landing H1 only |
| Page title | 40px | 48px | 700 | App page H1 |
| Section title | 28px | 36px | 650 | Major sections |
| Panel title | 20px | 28px | 650 | Cards, modal headers |
| Body | 16px | 26px | 400 | Default reading copy |
| Compact body | 14px | 22px | 400 | Dense app text |
| Label | 13px | 18px | 600 | Form/nav labels |
| Caption | 12px | 17px | 500 | Metadata, timestamps |

### Phone Web Type Scale

| Token | Size | Line height | Weight | Usage |
|---|---:|---:|---:|---|
| Hero | 36px | 42px | 700 | First screen H1 only |
| Page title | 28px | 34px | 700 | App page H1 |
| Section title | 22px | 30px | 650 | Major sections |
| Panel title | 17px | 24px | 650 | Cards, modal headers |
| Body | 15px | 24px | 400 | Default reading copy |
| Compact body | 13px | 20px | 400 | Dense app text |
| Label | 12px | 17px | 600 | Form/nav labels |
| Caption | 11px | 16px | 500 | Metadata, timestamps |

### Type Rules

- Normal text uses letter spacing `0`.
- Uppercase labels may use `0.06em` to `0.08em`, never more.
- Body text is regular weight. Do not use bold body paragraphs for emphasis.
- Bold is reserved for titles, active nav labels, important numbers, and CTA
  labels.
- Numeric values use tabular numerals.
- Long headings must wrap cleanly and never require viewport-based font sizing.
- Helper text must earn its place; visual state should do the work where
  possible.

## Spacing And Layout Rhythm

All spacing must be standardized. Random one-off values are the central problem
this pass fixes.

The implementation should introduce or update tokens so pages compose from a
small rhythm scale, not from ad hoc margins and inline styles.

### Shared Grid

- Base unit: 4px.
- All margin, padding, gap, radius, and control sizes must align to the 4px
  grid unless optical alignment needs a documented exception.
- Section rhythm must come from named tokens, not local magic numbers.

### Desktop Web Rhythm

Desktop is a professional cockpit for scanning and comparison.

| Role | Value |
|---|---:|
| Page horizontal padding | 32px |
| Page top padding below nav | 40px |
| Page bottom padding | 56px |
| Public content max width | 1180px |
| App content max width | 1280px |
| Hero section gap | 48px |
| Section gap | 40px |
| Cluster gap | 24px |
| Panel gap | 16px |
| Card/panel padding small | 16px |
| Card/panel padding medium | 24px |
| Card/panel padding large | 32px |
| Top nav height | 60px |
| Nav item height | 36px |
| Primary button height | 40px |
| Large CTA height | 48px |

Desktop nav should be dense but calm. Items should not float loosely. Active
state should be visible through weight, subtle fill, and accent border/color.

### Phone Web Rhythm

Phone web is its own contract, not a squeezed desktop. It becomes the baseline
for the future native APK visual language.

| Role | Value |
|---|---:|
| Page horizontal padding | 16px |
| Page top padding below topbar | 20px |
| Page bottom padding above bottom nav | 88px |
| Content max width | 100% |
| Hero section gap | 24px |
| Section gap | 28px |
| Cluster gap | 16px |
| Panel gap | 12px |
| Card/panel padding small | 12px |
| Card/panel padding medium | 16px |
| Card/panel padding large | 20px |
| Mobile topbar height | 56px |
| Mobile bottom nav height | 64px |
| Touch target minimum | 44px |
| Primary button height | 44px |
| Large CTA height | 48px |

Phone surfaces should be one-column by default. No horizontal overflow at
375px. Labels can collapse to icons only when the icon has an accessible name
and the interaction is obvious.

## Radius, Borders, And Elevation

The new shape system is tighter.

| Token | Value | Usage |
|---|---:|---|
| Radius small | 4px | Chips, small controls, tags |
| Radius standard | 6px | Cards, inputs, nav active fill |
| Radius large | 8px | Modals, major panels |
| Button radius | 10px | Primary and secondary buttons |
| Pill radius | 999px | Rare segmented controls/status pills only |

Cards should not be nested inside decorative cards. Page sections should not be
floating card wrappers. Prefer clean bands, open layout, rows, panels, and lists.

Elevation should be minimal:

- Light mode uses hairline borders and very soft cast shadows only where needed.
- Dark mode uses borders and surface steps, not glow clouds.
- Primary buttons may keep a subtle inset/cast treatment, but not candy shadows.

## Button And Control System

The button system must be updated to reflect the new brand.

### Light Buttons

| Variant | Treatment |
|---|---|
| Primary | Orange fill `#FF4C00`, white text, 10px radius |
| Secondary | `#EFEFEF` fill, `#262626` text, neutral border if needed |
| Ghost | Transparent, primary text, neutral hover fill |
| Inline | Orange text link, underline only in prose contexts |

### Dark Buttons

| Variant | Treatment |
|---|---|
| Primary | Teal fill `#12BFA5`, near-black text, 10px radius |
| Secondary | `#171717` fill, white text, `#343434` border |
| Ghost | Transparent, white text, neutral hover fill |
| Inline | Teal text link, underline only in prose contexts |

Button labels are 14px desktop and 14px/15px on phone depending on control
height. Button text is semibold or bold. Do not use pill radius for primary
CTAs.

Inputs, tabs, segmented controls, drawers, modals, and nav controls must share
the same control heights, label sizes, border widths, and focus rings within
each platform contract.

## Navigation Standard

Navigation is part of the brand system.

### Desktop Nav

- Height: 60px.
- Horizontal padding: 20px to 32px depending on shell width.
- Brand cluster gap: 8px to 10px.
- Nav item height: 36px.
- Nav item horizontal padding: 12px.
- Nav gap: 4px to 6px.
- Active item: semibold, accent color, subtle fill, hairline border.
- Inactive items: primary text, not faint gray.
- Account/avatar controls: 36px target.

### Phone Nav

- Topbar height: 56px.
- Bottom nav height: 64px.
- Icon target: 44px minimum.
- Bottom nav labels: 11px/12px, medium weight.
- Active item: accent color plus visible indicator/dot/fill.
- Inactive item: readable neutral, not disabled-looking.
- Account drawer and theme controls inherit mobile spacing tokens.

The navigation must not use random gaps, unbalanced item heights, or mixed text
weights between public and authed shells.

## Surface Scope For Implementation

This design pass covers:

1. `frontend/app/design-tokens.css`
2. `frontend/app/layout.tsx` theme default and font setup
3. `frontend/components/ui/button.tsx`
4. Public landing page and public nav
5. Authed app chrome and mobile shell rhythm
6. First-run/home surfaces
7. Shared CSS that controls global backgrounds, text, cards, inputs, nav,
   focus rings, skeletons, and theme controls

This pass should not redesign:

- The aperture-M mark
- Myrology sub-brand art direction
- Every deep feature page
- Native APK implementation
- Database/API naming or token economy internals

Deep feature pages should inherit the new tokens naturally. If a page still
looks off because of local hardcoded styling, it becomes a follow-up unless it
is part of the first-run/home or shell surfaces.

## Implementation Acceptance Gates

The pass is complete only when these are true:

- First paint defaults to light mode.
- User-selected dark mode persists and uses true black, not navy.
- Inter is the only core sans/display family.
- Light primary CTAs are orange.
- Dark primary CTAs are teal.
- Desktop and 375px phone screenshots show consistent margins, nav spacing,
  font sizes, font weights, control sizes, and panel padding.
- No horizontal overflow at 375px.
- Public landing/nav and first-run/home no longer contain glowy teal-first
  styling in light mode.
- Primary text, muted text, borders, and focus rings pass contrast checks in
  both themes.
- Type and spacing are tokenized enough that future pages can follow the system
  without copying page-specific magic numbers.
- Existing tests pass: frontend typecheck, lint, focused visual/source tests.

## Testing Plan

Implementation should verify:

- `cd frontend && npx tsc --noEmit`
- `cd frontend && npx next lint`
- Existing focused frontend tests touched by shell/home/nav/button behavior
- Browser visual QA on desktop and 375px mobile for:
  - `/`
  - `/home`
  - first-run home state if locally reachable
  - theme toggle light/dark
  - public nav and app chrome

Backend tests are not required for a frontend-only branding implementation
unless the code change touches backend-visible behavior.

## Follow-Up Notes

- If licensed Suisse files are provided later, Inter can be swapped through the
  font tokens without changing component hierarchy.
- The future native APK should inherit the phone web type/spacing rhythm before
  inventing platform-native styling.
- After this implementation ships, revise or archive the conflicting parts of
  `docs/DESIGN_SYSTEM.md` and `docs/CTA_DESIGN_SPEC.md` so the repo does not
  carry two competing systems.
