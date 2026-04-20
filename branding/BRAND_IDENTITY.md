# Truth Mirror — Brand Identity System

**Tagline:** *The Career Intelligence Platform.*
**Sub-tagline:** *Your one-stop career terminal.*

Version 1.0 · April 2026

---

## 1. Brand Positioning

Truth Mirror is not a job board, a resume builder, or another coach-y SaaS. It is a **career intelligence terminal** — a personal command center that reflects the unvarnished truth of where you stand in the labor market and shows you the next move.

The product is:

- **Diagnostic** — it tells you what is actually true about your skills, rank, and positioning.
- **Directional** — it doesn't just diagnose, it points to the next action.
- **Compounding** — every CV upload, every diary entry, every applied job makes the mirror sharper.

The brand should feel the way a Bloomberg terminal feels to a trader, the way a flight-deck feels to a pilot, the way Google Antigravity feels to a developer: **quiet, precise, confident, a little futuristic, never loud.**

The product is *for* people who are serious about their careers. The brand filters the rest out.

---

## 2. Brand Voice

| Dimension        | We are                                   | We are not                          |
| ---------------- | ---------------------------------------- | ----------------------------------- |
| Tone             | Calm, precise, observational             | Hype-y, exclamatory, motivational   |
| Vocabulary       | Signal, evidence, rank, trajectory       | Journey, unlock, crush, rockstar    |
| Posture          | Sits next to the user, analytical        | Cheers from the sideline            |
| Humor            | Dry, sparse, only when it lands          | Memes, emojis, gifs                 |
| Authority source | Data, taxonomy, market evidence          | Opinions, platitudes, inspo quotes  |

**Voice examples.**

- ✅ "Your skill graph shows a 12% overlap with Senior PM roles. Three skills close that gap."
- ❌ "You're SO close to landing your dream PM role! Let's crush it together 🚀"

- ✅ "Truth Score: 74 / 100. Ranked 412 of 8,921 in your cohort."
- ❌ "Nice work — you're in the top 5%! Keep going!"

---

## 3. Visual Language — The Big Idea

The visual system is built on **one question per screen** and **one clear action**. The interface looks like a data terminal that happens to be beautiful — not a marketing site that happens to have data.

**Core principles.**

1. **Monochrome base, single accent.** The whole UI is near-black. One color does the work of signaling *interaction*. That color is swappable between two states (see Accent System).
2. **Grid as atmosphere, not decoration.** A faint 44px grid lives behind everything — it reads as "this is a measurement surface."
3. **Type does the heavy lifting.** The hierarchy comes from a strict 5-level scale, not from color or weight chaos.
4. **Motion is intelligence, not decoration.** Things ease in, things trail the cursor, things reveal. Nothing bounces. Nothing wiggles.
5. **Data is art.** Charts, scores, and metrics are the hero objects. They're the reason the user came.

---

## 4. Logo System

### 4.1 Concept

The Truth Mirror mark is built on a single idea: **a reflective surface that reveals signal**. Candidate forms the designer should explore, ranked by fit:

1. **Aperture-M** — a stylized "M" formed by two inward-facing arcs, creating a camera-aperture / eye opening in the negative space. Reads as "mirror" and "focus."
2. **Horizon-line M** — a minimal wordmark with a single horizontal line bisecting the "M", evoking a mirror surface and a horizon.
3. **Signal dot** — an icon of a tight ring with a single pulse-dot in the center, like a radar ping. Used as the favicon / compact mark.
4. **TM monogram** — a geometric stacked "T/M" inside a squircle, for app icon use.

The primary mark should work at 16px (favicon) and 96px+ (hero). It must be legible in a single color.

### 4.2 Clear space

Minimum clear space around the mark = the height of the "M" stroke. Never crowd it with taglines or ornaments.

### 4.3 Don'ts

- Don't apply gradients to the logo. Solid fill only.
- Don't use the accent colors for the logo itself — the logo stays neutral (pure white or near-black) so the accent system can rotate underneath it.
- Don't tilt, skew, or outline the mark.
- Don't place the logo on images without a scrim.

### 4.4 Wordmark typography

The wordmark uses a **geometric sans at medium weight**, slightly wide tracking. Recommended: **Space Grotesk Medium** (already in the stack) or **Geist Medium** for a tighter feel. "Truth" and "Mirror" are set in the same weight — no italicization, no color split.

---

## 5. Color System — Dual Accent

The single most distinctive thing about the Truth Mirror brand is the **dual-accent toggle**. Users choose between two modes that change the interaction color across the entire app without changing the base, the surfaces, or the text. Everything else stays identical.

### 5.1 Base palette (constant across modes)

| Token            | Hex        | Role                                   |
| ---------------- | ---------- | -------------------------------------- |
| `--bg`           | `#050A18`  | Page background                        |
| `--surface`      | `#0B1222`  | Cards, panels                          |
| `--surface-2`    | `#111A2E`  | Elevated cards, modals                 |
| `--border`       | `#1B2540`  | 1px dividers                           |
| `--border-soft`  | `rgba(255,255,255,0.06)` | Hairlines, grid          |
| `--text`         | `#F0F4FF`  | Primary text                           |
| `--text-muted`   | `#9AA4BF`  | Labels, meta                           |
| `--text-faint`   | `#6F7891`  | Placeholders, tertiary                 |
| `--success`      | `#4ADE80`  | Applied, complete, positive delta      |
| `--warning`      | `#F59E0B`  | Pending, at-risk, gap alert            |
| `--danger`       | `#FB7185`  | Errors only — never for accents        |

### 5.2 Accent A — Signal (Teal / Electric Mint)

This is the "analytical" mode. Clinical, intelligent, precise. Default.

| Token              | Hex        | Role                                |
| ------------------ | ---------- | ----------------------------------- |
| `--accent`         | `#00F5D4`  | Primary interactive color           |
| `--accent-hover`   | `#53FFE3`  | Hover state                         |
| `--accent-pressed` | `#00C7AE`  | Active / pressed state              |
| `--accent-glow`    | `rgba(0, 245, 212, 0.35)` | Focus ring, glow halos |
| `--accent-wash`    | `rgba(0, 245, 212, 0.08)` | Subtle fills            |

### 5.3 Accent B — Forge (Amber / Warm Gold)

This is the "premium" mode. Warmer, more human, more warrior. Opt-in.

| Token              | Hex        | Role                                |
| ------------------ | ---------- | ----------------------------------- |
| `--accent`         | `#FFB347`  | Primary interactive color           |
| `--accent-hover`   | `#FFD07A`  | Hover state                         |
| `--accent-pressed` | `#E08E1F`  | Active / pressed state              |
| `--accent-glow`    | `rgba(255, 179, 71, 0.35)` | Focus ring, glow halos |
| `--accent-wash`    | `rgba(255, 179, 71, 0.10)` | Subtle fills           |

### 5.4 The toggle

The toggle lives in the sidebar footer — a two-segment pill labeled **Signal** / **Forge**. It writes `data-accent="signal"` or `data-accent="forge"` on `<html>`. CSS variables cascade down; every component switches instantly with a **200ms color transition on accent-only properties** (not layout, not opacity).

**Persistence.** Store the choice in `localStorage` under `tm.accent` and read on app boot to prevent flash of wrong accent.

**Non-goal.** This is not dark-mode. The base is always dark. Only the accent swaps.

### 5.5 Hard rules

- Any clickable text element uses `--accent`. Full stop.
- Non-clickable text uses `--text`, `--text-muted`, or `--text-faint`. Never `--accent`.
- `--success`, `--warning`, `--danger` are **status only**. Never borrow them as links.
- Metrics (numbers like `74`, `421 jobs/30d`) use `--text` at a larger size — bright but not colored. Only color a metric if it is itself clickable.

---

## 6. Typography

Single family, disciplined scale. No cursive. No novelty weights.

**Primary:** Space Grotesk (already in stack) — UI, body, headings.
**Display option:** Geist Mono or JetBrains Mono — for Truth Score, rank numbers, ticker-style data. Optional, used sparingly for "terminal" moments.

### 6.1 Scale (5 sizes only — enforce via tokens)

| Token           | Size / line-height | Usage                                     |
| --------------- | ------------------ | ----------------------------------------- |
| `--fs-display`  | 36px / 40px        | Hero numbers, Truth Score, landing H1     |
| `--fs-title`    | 24px / 32px        | Page titles                               |
| `--fs-heading`  | 18px / 26px        | Section headings                          |
| `--fs-body`     | 16px / 24px        | Default body, inputs, descriptions        |
| `--fs-meta`     | 13px / 18px        | Labels, chips, meta, helper text          |

Weights: 400 (body), 500 (headings, labels), 600 (titles, display). No bold 700+. No italics except for inline emphasis.

Tracking: `-0.01em` on display/title, `0` on body, `+0.02em` on meta labels (uppercase).

---

## 7. Spacing & Layout

- 4px base grid. Tailwind defaults (`gap-4`, `p-6`, `py-8`) are good.
- Section padding on pages: `py-10 px-8` minimum.
- Card padding: `p-6`. Dense card: `p-4`.
- Card radius: `12px` (`rounded-xl`).
- Modal radius: `20px` (`rounded-3xl`).
- Button height: 40px (default), 48px (CTA), 32px (dense).
- Maximum content width: 1280px. Sidebar steals 240px on the left.

---

## 8. Motion

- Default easing: `cubic-bezier(0.16, 1, 0.3, 1)` ("smooth out").
- Default duration: `200ms` for state (hover, accent swap), `380ms` for enter/exit.
- **Cursor-trailing edges.** Double the current count, reduce per-edge opacity by 30–40%, stagger delays. Respect `prefers-reduced-motion`.
- Never bounce. Never elastic. Never spin except for spinners.
- Everything that moves moves *once* and settles. No infinite animations on content.

---

## 9. Interaction Affordance — The Four-Signal Rule

If an element is clickable, it must carry **at least two** of these four signals:

1. Accent color on text or border.
2. `cursor: pointer`.
3. Distinct hover state (brightness, underline, glow, or elevation change).
4. Visible focus ring (`outline: 2px solid var(--accent-glow); outline-offset: 2px`).

Non-interactive text gets **none** of these.

---

## 10. Component Principles

- **Sidebar nav.** Inactive = `--text-muted`. Active = `--accent` + a soft accent-wash background. Hover lifts inactive to `--text`.
- **Buttons.** Three variants only: `primary` (filled accent), `ghost` (border + accent text), `subtle` (transparent + muted text + accent on hover).
- **Inputs.** 1px border `--border`. On focus, border goes `--accent` + glow ring. Placeholder = `--text-faint`.
- **Cards.** Background `--surface`. 1px border `--border-soft`. If clickable, hover elevates border to `--accent` at 30% opacity and adds a faint accent glow.
- **Status pills.** Only use `--success`, `--warning`, `--danger`. Background is the color at 12% opacity, text at 100%. Never use `--accent` for status.
- **Metrics.** Value in `--fs-display` or `--fs-title`, `--text`. Label beneath in `--fs-meta`, uppercase, `--text-muted`, letter-spacing `+0.08em`.

---

## 11. Iconography

Lucide icons, `1.5px` stroke, default size `20px`. Icons inside buttons scale to `16px`. Interactive icons inherit `currentColor` — they follow the accent automatically.

No filled icons except for status glyphs (check in success pill, alert in warning pill).

---

## 12. Imagery & Backgrounds

- No stock photography of people smiling at laptops. Ever.
- Abstract visuals only: topographic lines, node graphs, constellations, horizon gradients.
- Hero backgrounds: a subtle **radial vignette + grid**, optionally with a single faint accent glow in one corner.
- Charts use the accent color for primary series, `--text-muted` for secondary, `--success`/`--warning`/`--danger` only for status-driven series.

---

## 13. Writing Guardrails

- Page titles are nouns, not questions. "Matched Jobs" not "Which jobs match you?"
- Button labels are verbs. "Refresh matches", "Upload CV", "Track application".
- Never say "AI" in UI copy unless unavoidable. Say what it does: "Ranked by alignment", "Inferred from your CV".
- Numbers always carry their unit. "74 / 100", "421 jobs · 30d", "12% overlap".

---

## 14. What to Tell Every Designer & AI Agent Going Forward

Paste this paragraph into any design brief:

> Truth Mirror is a dark, futuristic career-intelligence terminal inspired by Google Antigravity's restraint. Use one interactive accent color across the whole app — either Signal Teal `#00F5D4` or Forge Amber `#FFB347`, never both at once in the same view. Non-clickable text stays in neutral grays. Typography is one family (Space Grotesk) at five sizes max (display/title/heading/body/meta). Base is near-black with a faint grid. Motion is smooth-out, never bouncy. Icons are Lucide at 1.5px. Any clickable element carries accent color + cursor + hover + focus ring. Charts and metrics are the heroes; the UI exists to frame them.

---

## 15. Living Document

This file is the source of truth. When a design decision conflicts with this document, either update the document first or don't make the change. No one-off component styles.
