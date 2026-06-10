/* Self-contained stroke icons (currentColor) ported from the design handoff.
   Kept local rather than mapping to lucide so the Upskilling pixels match the
   prototype exactly (stroke widths, viewBox, caps). */

import type { CSSProperties, JSX } from "react"

export type IconName =
  | "check" | "lock" | "arrow" | "back" | "close" | "target" | "flame"
  | "coin" | "cross" | "bolt" | "star" | "chevron" | "sparkle"

const PATHS: Record<IconName, JSX.Element> = {
  check: <polyline points="3.5 8.5 7 12 13 4.5" />,
  lock: <><rect x="3.5" y="7" width="9" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
  arrow: <><line x1="3" y1="8" x2="13" y2="8" /><polyline points="9 4 13 8 9 12" /></>,
  back: <><line x1="13" y1="8" x2="3" y2="8" /><polyline points="7 4 3 8 7 12" /></>,
  close: <><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></>,
  target: <><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.6" /></>,
  flame: <path d="M8 1.5s3.5 2.6 3.5 6a3.5 3.5 0 1 1-7 0c0-1.2.6-2.1 1.2-2.7 0 .9.6 1.4 1.1 1.4.8 0 .8-1 .5-2.2-.3-1.2.7-1.9.7-1.9z" />,
  coin: <><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6v6.8M6.2 6h3a1.3 1.3 0 0 1 0 2.6h-2.4a1.3 1.3 0 0 0 0 2.6h3" strokeWidth="1.4" /></>,
  cross: <><line x1="4.5" y1="4.5" x2="11.5" y2="11.5" /><line x1="11.5" y1="4.5" x2="4.5" y2="11.5" /></>,
  bolt: <polygon points="9 1.5 3.5 9 7.5 9 7 14.5 12.5 7 8.5 7" />,
  star: <polygon points="8 1.6 9.9 5.7 14.4 6.2 11 9.3 12 13.8 8 11.5 4 13.8 5 9.3 1.6 6.2 6.1 5.7" />,
  chevron: <polyline points="6 3.5 10.5 8 6 12.5" />,
  sparkle: <path d="M8 1.5l1.4 4.1L13.5 7 9.4 8.4 8 12.5 6.6 8.4 2.5 7l4.1-1.4z" />,
}

export function Icon({
  name,
  size = 18,
  style,
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  style?: CSSProperties
  strokeWidth?: number
}): JSX.Element {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}
    >
      {PATHS[name]}
    </svg>
  )
}
