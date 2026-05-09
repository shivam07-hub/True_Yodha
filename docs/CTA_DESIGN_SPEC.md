# Myro CTA Design Spec
### "Cast & Stamped" — Editorial intent, hand-set weight · v1.0 · 2026-05-09

This document specifies the unified CTA visual system for Myro. It governs the
`Button` primitive (Phase 1) and the intent-driven `Cta` module (Phase 2). It
sits alongside `DESIGN_CONSTITUTION.md` (the rules) and `UBIQUITOUS_LANGUAGE.md`
(the vocabulary) — those two documents are prerequisites for reading this one.

> **Status:** approved 2026-05-09. Phase 1 implementation in progress.

---

## Aesthetic direction

Buttons are **stamped, not bubbly.** The metaphor is letterpress: physical,
deliberate, slightly inset when pressed. We deliberately reject:

- Marshmallow shadows (chunky drop-shadows that read as mobile-app-y)
- Pills on solid emphasis (candy-soft, undermines the intelligence tone)
- Bouncy translate-Y hover lifts (Material-Design throwback)
- Glow effects on non-primary emphasis (visual inflation)

We commit to:

- **Inset-on-press** — the active state goes IN by 1px and swaps shadow direction.
  The button is stamped, not bounced.
- **Hairline cast shadow on solid at rest** — 1px inner-top highlight + 1px outer-bottom
  shadow, both at low opacity. Cast metal character without 3D-ifying.
- **Editorial radius** — `--tm-radius` (12px) for solid, `--tm-radius-sm` (6px) for sm-size.
  Never `--tm-radius-pill` on solid.
- **Drained disabled** — 35% saturation of the same hue, not a grey fill. Greys
  lose brand identity across the four accent palettes (cyan / teal / amber / brown).
- **Mono-dot loading** — three `·` characters in `--tm-font-mono` pulse-stagger.
  Reserves the label's width so layout doesn't shift.

The system is **theme-agnostic by construction**: every color references a
`--tm-*` token, never a hex literal. It must look correct in all four palettes
without a single change to the component code.

---

## 1 · Emphasis taxonomy (4 tiers, no more)

| Emphasis | When to use | Density rule |
|---|---|---|
| **`solid`** | The primary action on the surface — the one thing we want the user to do | At most one per surface. Adjacent solids fail Constitution Rule 2 (Single Frame of Truth). |
| **`outline`** | Secondary action paired with a solid (Cancel / Confirm), or single-action surfaces with low commitment | Up to 2 per surface |
| **`ghost`** | Tertiary / utility — toolbars, table rows, segmented controls, icon buttons | Unlimited |
| **`inline`** | An action embedded in running text or a list item — reads as part of the sentence, not as a button | Use when the surrounding context already gives the action gravity (numbered onboarding steps, list-row actions) |

> **Why not five tiers?** A 5th tier collapses into either `ghost` (boxed) or
> `inline` (in prose). Every additional tier multiplies decision cost and
> weakens the meaning of `solid`. Four is the maximum that survives a
> one-paragraph explanation.

---

## 2 · Variant specs

All values reference `--tm-*` tokens. The CSS below is reference; the actual
implementation lives as Tailwind classes inside the `Button` CVA in
`frontend/components/ui/button.tsx`.

### `solid` — the cast button (renamed from Shadcn's `default`)

```css
/* :rest */
background:    var(--tm-accent);
color:         var(--tm-accent-fg);
border:        1px solid var(--tm-accent);
box-shadow:    inset 0 1px 0 rgba(255,255,255,0.18),
               0 1px 0 rgba(0,0,0,0.08);
border-radius: var(--tm-radius);

/* :hover */
background:    var(--tm-accent-hover);
border-color:  var(--tm-accent-hover);
box-shadow:    inset 0 1px 0 rgba(255,255,255,0.22),
               0 2px 6px rgba(0,0,0,0.10);

/* :active */
background:    var(--tm-accent-pressed);
border-color:  var(--tm-accent-pressed);
box-shadow:    inset 0 1px 2px rgba(0,0,0,0.18);
transform:     translateY(1px);

/* :focus-visible */
outline:       2px solid var(--tm-accent-ring);
outline-offset: 2px;

/* :disabled */
filter:        saturate(0.35);
opacity:       0.6;
cursor:        not-allowed;
```

### `outline` — the considered button

```css
/* :rest */
background:    transparent;
color:         var(--tm-accent);
border:        1px solid var(--tm-accent-ring);
border-radius: var(--tm-radius);

/* :hover */
background:    var(--tm-accent-wash);
border-color:  var(--tm-accent);

/* :active */
background:    var(--tm-accent-wash);
border-color:  var(--tm-accent-pressed);
color:         var(--tm-accent-pressed);
transform:     translateY(1px);

/* No box-shadow ever. No glow ever. The outline lives by its border. */
```

### `ghost` — the utility button

```css
/* :rest */
background:    transparent;
color:         var(--tm-text-muted);
border:        1px solid transparent;
border-radius: var(--tm-radius);

/* :hover */
background:    var(--tm-hover);
color:         var(--tm-text);

/* :active */
background:    var(--tm-hover);
transform:     translateY(1px);

/* aria-pressed=true (toggle state) */
background:    var(--tm-accent-wash);
color:         var(--tm-accent);
border-color:  var(--tm-accent-ring);
```

### `inline` — the prose link (renamed from Shadcn's `link`)

```css
/* :rest */
display:                   inline;
color:                     var(--tm-accent);
font:                      inherit;
text-decoration:           underline;
text-decoration-thickness: 1px;
text-underline-offset:     3px;
padding:                   0;
border-radius:             0;
background:                none;

/* :hover */
color:                     var(--tm-accent-hover);
text-decoration-thickness: 2px;

/* :active */
color:                     var(--tm-accent-pressed);

/* :focus-visible */
outline:        2px solid var(--tm-accent-ring);
outline-offset: 3px;
border-radius:  2px;
```

> `inline` is a typed link, not a styled button. It deliberately strips all
> box-shape characteristics. Always renders as `<a>` (via `asChild` + `<Link>`).

---

## 3 · Size scale (3 tiers — no `xs`)

| Size | Height | Padding (X) | Font | Radius | Use case |
|---|---|---|---|---|---|
| **`sm`** | 32px | 12px | `--tm-fs-caption` (13px) | `--tm-radius-sm` (6px) | Dense rows, segmented controls, table actions |
| **`md`** *(default)* | 40px | 16px | `--tm-fs-meta` (15px) | `--tm-radius` (12px) | Page CTAs, forms, toolbars — workhorse |
| **`lg`** | 48px | 22px | `--tm-fs-body` (17px) | `--tm-radius` (12px) | Hero CTAs, empty states, onboarding |

**Icon-only sizes:**

| Size | Box | Icon | Use case |
|---|---|---|---|
| **`icon-sm`** | 32×32 | 16px | Toolbars, table rows |
| **`icon-md`** | 40×40 | 20px | Page-level icon buttons |

> **Why no `xs`?** Today's `xs` (24px) is below the Fitts threshold for reliable
> hits and always ends up being a ghost icon button. We give icon-only its own
> sizes instead.

> **Why no `icon-lg`?** Hero CTAs read better with text. If a 48px icon-only
> button is ever needed, propose an amendment to this spec.

> **Why no pill radius on solid?** Pill is reserved for chips, toggles, tags —
> non-actions. Mixing pill on solid CTAs collapses the difference between
> "data displayed in a pill" and "action you can take". One semantic, one shape.

---

## 4 · Motion specs

```css
transition: background  var(--tm-dur)      var(--tm-ease),
            color       var(--tm-dur)      var(--tm-ease),
            border      var(--tm-dur)      var(--tm-ease),
            box-shadow  var(--tm-dur)      var(--tm-ease),
            transform   var(--tm-dur-fast) var(--tm-ease),
            filter      var(--tm-dur)      var(--tm-ease);
```

| Trigger | Duration | Curve | Tokens |
|---|---|---|---|
| Hover in/out | 200ms | `--tm-ease` | `--tm-dur` |
| Active press | 120ms | `--tm-ease` | `--tm-dur-fast` (faster than hover — feels mechanical) |
| Focus ring | instant | — | (no transition; appears on tab) |
| Loading enter | 380ms | `--tm-ease` | `--tm-dur-slow` (label fades to dots) |
| Disabled toggle | 200ms | `--tm-ease` | `--tm-dur` |

**Loading state** — replaces label, reserves width:

```tsx
{loading ? (
  <span className="font-mono inline-flex gap-[2px] tabular-nums">
    <span className="animate-pulse [animation-delay:0ms]">·</span>
    <span className="animate-pulse [animation-delay:120ms]">·</span>
    <span className="animate-pulse [animation-delay:240ms]">·</span>
  </span>
) : children}
```

**Reduced motion** — wrap any `transform` / `opacity` transition in
`@media (prefers-reduced-motion: reduce)` and fall back to instant state changes.
No press-down translate; no fade. Color and background changes still apply
because they carry information.

---

## 5 · Composition rules with icons

| Convention | Spec |
|---|---|
| Trailing arrow (action navigates) | `→` glyph in label, separated by a regular space — not an icon component. Travels with text on hover. |
| Leading icon (action with object) | `<Icon size={16} />` slot, 6px gap to label, `currentColor` fill |
| Icon-only buttons | `size="icon-sm"` or `size="icon-md"`, mandatory `aria-label` |
| Two icons on one button (icon + label + chevron) | **Forbidden.** One affordance per button. Pick: leading icon OR trailing chevron. |

---

## 6 · Anti-patterns (forbidden)

| ❌ | Why |
|---|---|
| Inline-styled CTAs | Bypasses every rule above. PR check must reject. |
| `--tm-radius-pill` on `solid` | Reads as a chip, not an action |
| Two `solid` emphases adjacent on one surface | Violates one-primary-action-per-surface; fails Constitution Rule 2 |
| `box-shadow: var(--tm-shadow-glow)` on `outline` or `ghost` | Glow is reserved for `solid` |
| Hex literals in any CTA component | Defeats theme retheming |
| `pointer-events: none` as the only disabled signal | Users will rage-click. Must also be visually drained. |
| Loading state that collapses the button | Width must be reserved (use the dot-loader) |
| `tm-btn` / `tm-btn-primary` / `tm-btn-ghost` / `tm-btn-subtle` classes | Removed in Phase 1. New code never references them. |
| `<button onClick={() => router.push(...)}>` | If it navigates, it must be `<a>` / `<Link>`. Use `asChild`. |

---

## 7 · Migration plan

### Phase 1 — `Button` consolidation *(in progress)*

1. Rewrite `frontend/components/ui/button.tsx` CVA:
   - Rename `default` → `solid`
   - Rename `link` → `inline`
   - Remove `secondary` and `destructive` (no current consumers; reintroduce when needed)
   - Add the cast-shadow / press / focus specs from § 2
   - Add `loading?: boolean` prop with the dot-loader from § 4
   - Replace size scale: kill `xs`; keep `sm` / `md` (default) / `lg`; keep `icon-sm`, `icon-md`
2. Delete `.tm-btn`, `.tm-btn-primary`, `.tm-btn-ghost`, `.tm-btn-subtle` from
   `frontend/app/design-tokens.css`.
3. Migrate every consumer of the deleted classes and every inline-styled CTA
   to `<Button>` (use `asChild` for `<Link>` cases).

### Phase 2 — `Cta` intent module

1. Create `frontend/components/ui/cta.tsx`:
   - Props: `intent: "upload-cv" | "enter-forge" | …`, `emphasis: "solid" | "outline" | "ghost" | "inline"`, optional `size`, optional override `label` / `href`.
   - Internal registry maps intent → `{ label, href, analyticsEvent, icon? }`.
2. Migrate the six Upload-CV call sites to `<Cta intent="upload-cv" emphasis={…} />`.
3. Add row to `UBIQUITOUS_LANGUAGE.md` for `Cta`.

---

## 8 · Verification checklist for Phase 1

Before opening the migration PR, verify:

- [ ] No `.tm-btn` substring remains in `frontend/` (grep clean)
- [ ] No `style={{...}}` on any `<button>` or `<Link>` that fires an action (grep + manual review)
- [ ] All four accent palettes render every variant correctly (cyan / teal / amber / brown)
- [ ] Disabled state visible without hover (drained, not just `pointer-events: none`)
- [ ] Loading state preserves button width within ±1px of label width
- [ ] `prefers-reduced-motion: reduce` strips transforms but keeps color transitions
- [ ] PR description includes `Constitution check: rules 1–5 ✓`
