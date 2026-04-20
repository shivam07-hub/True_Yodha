# /branding — Truth Mirror brand system

Everything needed to ship the redesigned, Antigravity-grade Truth Mirror UI.

## Files

| File                        | What it is                                        |
| --------------------------- | ------------------------------------------------- |
| `BRAND_IDENTITY.md`         | The source-of-truth brand document. Read first.   |
| `LOGO_PROMPTS.md`           | 7 Nano Banana prompts for the logo mark.          |
| `design-tokens.css`         | All CSS variables + primitive classes (canonical copy — also mirrored to `frontend/app/design-tokens.css`). |
| `tailwind.brand.config.ts`  | Tailwind `extend` reference (already merged into `frontend/tailwind.config.ts`). |
| `AccentToggle.tsx`          | React component for the Signal ↔ Forge toggle (already mirrored to `frontend/components/accent-toggle.tsx`). |

## Status

**Wired into `frontend/` as of 2026-04-19.** The live app reads from the tokens, the favicon is the Signal Dot, and the Signal ↔ Forge toggle is mounted in the sidebar footer. When tokens change here, copy updates into `frontend/app/design-tokens.css` to keep them in sync.

---

## Wiring checklist (when you're ready to redesign)

1. **Import the tokens.** In `frontend/app/globals.css`, replace the existing `@layer base { :root { ... } }` block with:

   ```css
   @import "../../branding/design-tokens.css";
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

   (Adjust the relative path if Next.js can't resolve it — you may want to copy `design-tokens.css` into `frontend/app/` and import locally.)

2. **Extend Tailwind.** In `frontend/tailwind.config.ts`:

   ```ts
   import brand from "../branding/tailwind.brand.config"

   const config: Config = {
     // ...existing...
     theme: {
       container: { /* existing */ },
       extend: {
         ...brand.extend,
         // keep any existing extensions you still need
       },
     },
   }
   ```

3. **Prevent the flash of wrong accent.** In `frontend/app/layout.tsx`, inside `<head>`, add:

   ```tsx
   <script
     dangerouslySetInnerHTML={{
       __html: `
         (function() {
           try {
             var a = localStorage.getItem('tm.accent') || 'signal';
             document.documentElement.setAttribute('data-accent', a);
           } catch (e) {
             document.documentElement.setAttribute('data-accent', 'signal');
           }
         })();
       `,
     }}
   />
   ```

4. **Mount the toggle.** Copy `AccentToggle.tsx` into `frontend/components/` and render it in the sidebar footer:

   ```tsx
   import { AccentToggle } from "@/components/AccentToggle"
   // ...
   <AccentToggle />
   ```

5. **Drop in the logo.** Once the Nano Banana mark is chosen, export the variations listed at the bottom of `LOGO_PROMPTS.md` and place them in `frontend/public/brand/`.

---

## Using the tokens in components

You can reach for the tokens three ways, in order of preference:

**Primitive classes** (fastest for new work):
```tsx
<button className="tm-btn tm-btn-primary">Upload CV</button>
<a className="tm-link">Read the method</a>
<div className="tm-card tm-card-interactive">…</div>
```

**Tailwind utilities** (for fine-grained layout):
```tsx
<h1 className="text-display text-tm-text">74</h1>
<span className="text-meta text-tm-text-muted">Truth Score</span>
<div className="bg-tm-surface border border-tm-border-soft rounded-tm">…</div>
```

**Raw variables** (for one-off custom styles):
```tsx
<div style={{ boxShadow: "var(--tm-shadow-glow)" }} />
```

---

## Non-negotiables (same as `BRAND_IDENTITY.md` §5.5)

- Clickable text uses `var(--tm-accent)`. Always.
- Non-clickable text uses `--tm-text`, `--tm-text-muted`, or `--tm-text-faint`. Never the accent.
- `--tm-success`, `--tm-warning`, `--tm-danger` are status-only. They are not link colors.
- Use the 5-size type scale. No arbitrary sizes.
- Every interactive element carries at least 2 of: accent color, pointer cursor, hover state, focus ring.

If a component doesn't fit the tokens, update the tokens — don't escape them.
