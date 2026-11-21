import type { SVGProps } from "react"

/**
 * Chrome's mark in our line weight. lucide-react 1.x dropped brand icons, and
 * a button that sends someone to the Chrome Web Store has to say Chrome before
 * the click, not after. Geometry is lucide's former `chrome` icon (ISC).
 */
export function ChromeGlyph({
  size = 14,
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
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="M21.17 8H12M3.95 6.06 8.54 14M10.88 21.94 15.46 14" />
    </svg>
  )
}
