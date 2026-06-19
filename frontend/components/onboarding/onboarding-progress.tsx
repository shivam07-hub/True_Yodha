import { Check } from "lucide-react"

const STAGES = ["Experience", "Target", "Result"] as const

interface Props {
  current: 0 | 1 | 2
  onStageClick?: (stage: 0 | 1 | 2) => void
}

export function OnboardingProgress({ current, onStageClick }: Props) {
  return (
    <nav aria-label="Onboarding progress" className="mx-auto w-full max-w-3xl px-5 pt-5 sm:px-8">
      <ol className="grid grid-cols-3 gap-2">
        {STAGES.map((label, index) => {
          const complete = index < current
          const active = index === current
          const clickable = complete && Boolean(onStageClick)
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => { if (clickable) onStageClick?.(index as 0 | 1 | 2) }}
                aria-current={active ? "step" : undefined}
                className="tm-control-focus flex w-full items-center gap-2 rounded-md p-1 text-left disabled:cursor-default"
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    complete || active
                      ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-bg)]"
                      : "border-[var(--tm-border)] text-[var(--tm-text-faint)]"
                  }`}
                >
                  {complete ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className={`hidden text-sm sm:block ${active ? "font-semibold text-[var(--tm-text)]" : "text-[var(--tm-text-muted)]"}`}>
                  {label}
                </span>
              </button>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--tm-border-soft)]">
                <div className={`h-full ${index <= current ? "w-full bg-[var(--tm-interactive)]" : "w-0"}`} />
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-sm font-medium text-[var(--tm-text-muted)] sm:hidden">
        {STAGES[current]} · Step {current + 1} of 3
      </p>
    </nav>
  )
}
