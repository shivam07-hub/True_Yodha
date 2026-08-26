import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  error?: string | null
  contentClassName?: string
  /** Rendered inside the same fixed container, above the action row. Anything
   *  that must sit directly on top of the primary action belongs here rather
   *  than in a second fixed element guessing this one's height. */
  above?: ReactNode
}

/**
 * The first two onboarding decisions share one persistent place for their
 * primary action. Keeping it outside the scrollable decision surface means a
 * long CV-skill list or a dense list of locations never hides the next step.
 *
 * Its height is content-driven (an error message adds a line, so does the safe
 * area), so anything that needs to sit above it goes in `above` and rides the
 * same container. The pane tabs used to be a second fixed element pinned at
 * `bottom: 7rem` — a guess at this bar's height, and 105px short of it, which
 * left the skill list scrolling through the gap between the two bars.
 */
export function StickyOnboardingActionBar({ children, error, contentClassName, above }: Props) {
  const content = cn("mx-auto", contentClassName)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-soft)] bg-[var(--tm-bg)]">
      {above}
      <div className={cn(content, "[padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]")}>
        {children}
        {error && <p role="alert" className="mt-3 px-5 text-sm text-[var(--tm-danger)] sm:px-8">{error}</p>}
      </div>
    </div>
  )
}
