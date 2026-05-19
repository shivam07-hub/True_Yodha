import type { ReactElement } from "react"
import type { FeedbackCategory } from "./feedback-types"

const COMMON_PROPS = {
  fill: "none",
  stroke: "currentColor" as const,
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

export function CategoryGlyph({ category, size = 20 }: { category: FeedbackCategory; size?: number }): ReactElement {
  const props = { width: size, height: size, viewBox: "0 0 24 24", ...COMMON_PROPS }
  switch (category) {
    case "bug":
      return (
        <svg {...props}>
          <path d="M12 3 L21 19 L3 19 Z" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" />
        </svg>
      )
    case "idea":
      return (
        <svg {...props}>
          <path d="M9 18 h6" />
          <path d="M10 21 h4" />
          <path d="M12 3 a6 6 0 0 1 4 10.5 c-.6.6-1 1.4-1 2.3 V16 H9 v-0.2 c0-.9-.4-1.7-1-2.3 A6 6 0 0 1 12 3 z" />
        </svg>
      )
    case "question":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5 a2.5 2.5 0 0 1 5 0 c0 1.5 -2.5 2 -2.5 4" />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" />
        </svg>
      )
    case "praise":
      return (
        <svg {...props}>
          <path
            d="M7 13 a5 5 0 1 0 10 0 c0 -3 -2 -5 -5 -5 s-5 2 -5 5 z"
            transform="rotate(180 12 12)"
          />
          <path d="M5 13 v8 h4 V13" />
        </svg>
      )
  }
}

export function HubGlyph({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...COMMON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}
