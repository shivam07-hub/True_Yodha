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

export function JourneyProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="grid grid-cols-3 gap-2 sm:gap-4">
        {STEPS.map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3
          const complete = step < current
          const active = step === current
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={cn(
                "border-t-2 pt-3",
                step <= current ? "border-[var(--tm-interactive)]" : "border-[var(--tm-border)]",
              )}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-[var(--tm-text-muted)] sm:text-sm">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums",
                    active && "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]",
                    complete && "border-[var(--tm-interactive)] text-[var(--tm-interactive)]",
                    step > current && "border-[var(--tm-border)] text-[var(--tm-text-faint)]",
                  )}
                  aria-hidden="true"
                >
                  {complete ? <Check className="size-3.5" /> : step}
                </span>
                <span className={cn("hidden text-pretty sm:block", active && "text-[var(--tm-text)]")}>{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
