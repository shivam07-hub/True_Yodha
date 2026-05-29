"use client"

import "./journey-strip.css"

/**
 * Onboarding Journey Strip — 5-step ribbon shown to first-time users
 * across signup → onboarding → first /cv visit. Tells them where they
 * are in the 0→10 minute loop.
 *
 * Steps: 1 Drop · 2 Read · 3 Target · 4 Tailor · 5 Download.
 * Single-word labels — echo the upload loading screen (received → extracting →
 * scoring) and fit each equal-width column without ellipsis truncation.
 * Code symbol per docs/UBIQUITOUS_LANGUAGE.md: `<OnboardingJourneyStrip />`.
 */

type JourneyStep = 1 | 2 | 3 | 4 | 5

const STEPS: { n: JourneyStep; title: string }[] = [
  { n: 1, title: "Drop"     },
  { n: 2, title: "Read"     },
  { n: 3, title: "Target"   },
  { n: 4, title: "Tailor"   },
  { n: 5, title: "Download" },
]

export const JOURNEY_DONE_KEY = "myro_journey_completed_v1"

export function isJourneyDone(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(JOURNEY_DONE_KEY) === "1"
}

export function markJourneyDone(): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(JOURNEY_DONE_KEY, "1")
}

export function OnboardingJourneyStrip({
  currentStep,
  compact = false,
}: {
  currentStep: JourneyStep
  compact?: boolean
}) {
  return (
    <nav
      className={"tm-jstrip" + (compact ? " tm-jstrip-compact" : "")}
      aria-label={`Onboarding journey: step ${currentStep} of ${STEPS.length}`}
    >
      <div className="tm-jstrip-rail" aria-hidden>
        <div
          className="tm-jstrip-rail-fill"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
      <ol className="tm-jstrip-steps" role="list">
        {STEPS.map((s) => {
          const state =
            s.n < currentStep ? "done" : s.n === currentStep ? "active" : "pending"
          return (
            <li key={s.n} className={`tm-jstrip-step is-${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="tm-jstrip-node" aria-hidden>
                <span className="tm-jstrip-num">{String(s.n).padStart(2, "0")}</span>
              </span>
              <span className="tm-jstrip-title">{s.title}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
