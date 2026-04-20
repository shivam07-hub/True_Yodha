# Truth Mirror — Logo Prompts for Nano Banana

Use these prompts with Google's Nano Banana (Gemini 2.5 Flash Image). Each block is a complete, paste-ready prompt that produces a different direction for the Truth Mirror mark. Generate 3–4 variations per prompt and pick the strongest.

**Prompt-crafting rules that apply to all of these:**
- Always output on a **pure black `#050A18` background** so the mark drops straight into the app.
- Always request a **single-color flat vector** in pure white `#F0F4FF`. No gradients, no drop shadows, no glow, no 3D. The accent color is handled in CSS later.
- Always ask for the **mark centered with generous negative space** and no taglines baked into the image.
- If Nano Banana produces extra text or artifacts, regenerate with "no text, no letters, no extra marks" appended.

After generating, save favorites to `/branding/logo/` as PNG + SVG when possible.

---

## Prompt 1 — Aperture-M (primary recommendation)

> Minimalist logo mark for a career intelligence platform called Truth Mirror. A geometric letter "M" formed by two inward-facing circular arcs that create a camera-aperture opening in the negative space at the center. The aperture reads simultaneously as a stylized eye and the letter M. Flat vector, pure white `#F0F4FF` on solid near-black background `#050A18`. Single color, no gradients, no shadows, no 3D, no bevel. Geometric precision, 1.5 stroke-weight feel, mathematically clean. Centered composition, generous negative space, square 1:1 format. No text, no letters, no tagline. The mark should work at 16 pixels as a favicon and at 200 pixels as a hero. Premium, restrained, Google-Antigravity-adjacent.

---

## Prompt 2 — Horizon M (wordmark-friendly)

> A minimalist monogram for a career intelligence terminal called Truth Mirror. The letter "M" drawn as four vertical strokes with a thin horizontal line running through the middle, like a mirror-surface or horizon bisecting the letter. The horizon line extends slightly beyond the M on both sides, suggesting an optical reflection. Flat geometric vector, pure white `#F0F4FF` on solid `#050A18` black background. No gradients, no shadows, no glow, no 3D. Square 1:1 composition, centered with generous margin. No text, no extra letters. Feels like a calm, serious data-platform mark. Inspiration: Linear, Vercel, Google Antigravity.

---

## Prompt 3 — Signal Dot (favicon / app icon)

> A minimalist app icon for a career intelligence platform. A perfect thin circular ring with a single solid dot precisely centered inside it, like a radar ping or a scope reticle. The ring is `1.5px`-feel thin. Pure white `#F0F4FF` mark on a solid near-black `#050A18` rounded-square canvas with very subtle inner bezel. Flat vector, no gradients, no shadows, no glow. Centered composition, 1:1 square format with slight margin. No text, no letters, no other marks. Feels precise, observational, quietly futuristic. Inspiration: Bloomberg terminal, Arc browser, crosshair reticles.

---

## Prompt 4 — Stacked TM Monogram (app icon alternate)

> A geometric monogram combining the letters "T" and "M" into a single unified mark for a career intelligence platform called Truth Mirror. The T sits above or overlaps the M such that the T's horizontal bar doubles as the apex of the M. Pure geometric construction, equal stroke weights, sharp corners softened to 2px radius. Pure white `#F0F4FF` on solid `#050A18` background. Flat, single color, no gradients, no shadows, no 3D. Square 1:1, centered, generous negative space. No tagline, no extra letters beyond the T and M themselves. Clean, confident, premium. Inspiration: geometric monograms like Paul Rand, Massimo Vignelli.

---

## Prompt 5 — Reflected Peak (mirror concept, literal)

> A minimalist abstract logo mark depicting a single sharp triangular peak with a precise thin horizontal line bisecting it, and below the line, a mirrored reversed triangle of slightly fainter weight suggesting a reflection on water. Reads as a mountain reflected in a mirror — or a data peak reflected in analysis. Flat geometric vector, pure white `#F0F4FF` on solid `#050A18` near-black background. Single color, no gradients, no shadows, no glow, no 3D. Square 1:1 composition, centered with generous negative space. No text, no letters. Precise, calm, analytical feel. Inspiration: Swiss modernism, topographic maps, Google Antigravity aesthetic.

---

## Prompt 6 — Wordmark only (for header / splash)

> A horizontal wordmark for a product called "Truth Mirror". The two words are set in a clean geometric sans-serif at medium weight (Space Grotesk Medium or similar), letter-spacing slightly widened, both words at exactly the same size and weight, separated by a thin vertical divider line of equal height. Pure white `#F0F4FF` text on solid `#050A18` near-black background. Flat, no gradients, no shadows. Horizontal 16:9 composition, centered, generous margin. No icon, no tagline, no other elements — wordmark only. Typography is the only hero. Feels premium, restrained, terminal-like.

---

## Prompt 7 — Combo lockup (icon + wordmark)

> A horizontal logo lockup for a career intelligence platform called "Truth Mirror". Left side: a minimalist mark of a thin circular ring with a centered dot (radar ping). Right side, separated by generous space: the wordmark "Truth Mirror" in geometric sans-serif medium weight, letter-spacing slightly widened. Both elements in pure white `#F0F4FF` on solid `#050A18` black. Equal visual weight between mark and wordmark. Flat vector, no gradients, no shadows, no 3D. Horizontal composition with generous whitespace on all sides. No tagline, no extra decoration. Inspired by Google Antigravity, Linear, and Bloomberg Terminal.

---

## How to pick the winner

After generating 3–4 variants per prompt, judge each candidate against these questions:

1. Does it still read at 16px? (Squint test — shrink to thumbnail.)
2. Does it work in one color? (It must — the accent rotates underneath it.)
3. Is it doing *one* thing, not three? (Aperture-eye-M trying to also be a compass = no.)
4. Does it feel like a Bloomberg terminal, not a bootcamp?
5. Could a competitor steal it tomorrow? If yes, it's generic — regenerate.

**Recommended top-3 to generate first:** Prompt 1 (Aperture-M), Prompt 3 (Signal Dot), Prompt 7 (Combo lockup). If Aperture-M lands, you have your primary mark + Signal Dot is your favicon + Combo becomes your header.

---

## Post-generation checklist

Once you pick the final mark, save these variations:

- `truth-mirror-mark.svg` — primary icon, white on transparent
- `truth-mirror-mark-dark.svg` — primary icon, near-black on transparent
- `truth-mirror-wordmark.svg` — wordmark only
- `truth-mirror-lockup.svg` — icon + wordmark horizontal
- `favicon.ico` — 32×32 + 16×16 bundle
- `apple-touch-icon.png` — 180×180
- `og-image.png` — 1200×630 with mark centered on dark grid background

Drop all of these in `frontend/public/brand/` and reference from `app/layout.tsx`.
