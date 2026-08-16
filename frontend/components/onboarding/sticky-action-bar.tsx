import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  error?: string | null
  contentClassName?: string
}

/**
 * The first two onboarding decisions share one persistent place for their
 * primary action. Keeping it outside the scrollable decision surface means a
 * long CV-skill list or a dense list of locations never hides the next step.
 */
export function StickyOnboardingActionBar({ children, error, contentClassName }: Props) {
  const content = cn("mx-auto", contentClassName)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-soft)] bg-[var(--tm-bg)]">
      <div className={cn(content, "[padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]")}>
        {children}
        {error && <p role="alert" className="mt-3 px-5 text-sm text-[var(--tm-danger)] sm:px-8">{error}</p>}
      </div>
    </div>
  )
}
