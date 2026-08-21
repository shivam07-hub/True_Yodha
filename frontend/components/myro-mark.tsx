import type { SVGProps } from "react"

/**
 * The Myro aperture, inline and colourable — a ring with a centre dot, the
 * same figure as the app icon (`/brand/aperture-m.png`).
 *
 * This exists because `MyroLogo` cannot do this job. The logo is a raster
 * `<Image>` sized for chrome (nav, footer, auth shells, empty states); it
 * cannot take `currentColor`, and at text size it renders mushy. So when a
 * surface needed to say "this is Myro speaking" *inline, next to a word*, the
 * nearest thing to hand was `Sparkles` — the universal "an AI did this" glyph,
 * which contradicts our own copy rule (say what it does, never say "AI") and
 * is a first-order vibecoded tell (ANTI_SLOP.md §24).
 *
 * The tell recurred because there was no right answer to reach for. This is it.
 *
 *   MyroLogo  — the brand, as an object on the page. ≥20px, chrome.
 *   MyroMark  — the brand, as a glyph in a sentence. currentColor, text-sized.
 *
 * Drawn on lucide's 24-unit grid at stroke 1.5, so it sits in an icon row
 * without looking imported from somewhere else.
 */
export function MyroMark({
  size = 16,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "width" | "height"> & { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="12" cy="12" r="8.75" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
