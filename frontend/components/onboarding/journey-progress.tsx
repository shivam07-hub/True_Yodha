import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * One rail for the whole onboarding, including the upload screen it starts on.
 *
 * There used to be two. `/onboarding` showed "01 Upload your CV · 02 Get your
 * Myro Score · 03 Tailor and apply" (the product arc, borrowed from the landing
 * page) and `/onboarding/result` showed this one. So a user finished "Step 01",
 * moved to the next screen, and found themselves on step 1 again — unfinished,
 * differently numbered, differently worded. Progress appeared to reset.
 *
 * Labels are nouns, not verbs, because each has to stay true across the whole of
 * its step: step 1 covers uploading the CV AND reviewing what was found in it,
 * and "Check what we found" was a lie while the file was still uploading.
 */
const STEPS = ["Your CV", "Your direction", "Live roles"] as const

interface Props {
  /** The step being displayed. */
  current: 1 | 2 | 3
  /** The furthest the user has actually reached. Steps up to it are reviewable. */
  furthest?: number
  onSelect?: (step: 1 | 2 | 3) => void
}

/**
 * The rail is also the way back.
 *
 * It already looked like one — a numbered, ticked sequence — while being inert,
 * so the only route back through the journey was a button that DELETED the
 * decision behind it. Any step at or below `furthest` is ground the user has
 * covered, and revisiting it is a read.
 */
export function JourneyProgress({ current, furthest = 0, onSelect }: Props) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="grid grid-cols-3 gap-2 sm:gap-4">
        {STEPS.map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3
          const complete = step < current
          const active = step === current
          const reviewable = Boolean(onSelect) && step <= furthest && !active
          const marker = (
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums",
                active && "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]",
                complete && "border-[var(--tm-interactive)] text-[var(--tm-interactive)]",
                step > current && !reviewable && "border-[var(--tm-border)] text-[var(--tm-text-faint)]",
                step > current && reviewable && "border-[var(--tm-interactive)] text-[var(--tm-interactive)]",
              )}
              aria-hidden="true"
            >
              {complete ? <Check className="size-3.5" /> : step}
            </span>
          )
          const text = (
            <>
              <span className={cn("hidden text-pretty sm:block", active && "text-[var(--tm-text)]")}>{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
            </>
          )
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={cn(
                "border-t-2 pt-3",
                step <= Math.max(current, furthest) ? "border-[var(--tm-interactive)]" : "border-[var(--tm-border)]",
              )}
            >
              {reviewable ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(step)}
                  className="tm-control-focus flex min-h-9 w-full items-center gap-2 rounded text-left text-xs font-semibold text-[var(--tm-text-muted)] sm:text-sm"
                >
                  {marker}
                  {text}
                </button>
              ) : (
                <span className="flex min-h-9 items-center gap-2 text-xs font-semibold text-[var(--tm-text-muted)] sm:text-sm">
                  {marker}
                  {text}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
