"use client"

import { useCvPromise } from "@/lib/hooks/use-cv-promise"

/** The 10-min CV-promise countdown pill. First-run only; renders nothing once
 *  the promise is delivered (phase "idle"). Tapping routes the user to /cv to
 *  finish. (progressive-nav grill Q4) */
export function CvPromisePill({
  firstRun,
  hasCv,
  onClick,
}: {
  firstRun: boolean
  hasCv: boolean
  onClick: () => void
}) {
  const { phase, mmss } = useCvPromise(firstRun, hasCv)
  if (phase === "idle") return null

  const isFinish = phase === "finish"
  const isPromise = phase === "promise"

  return (
    <button
      type="button"
      className="tm-cv-promise"
      data-phase={phase}
      onClick={onClick}
      title={
        isFinish
          ? "Your 10 minutes — let's finish your CV"
          : "Your first tailored CV in 10 minutes"
      }
      aria-label={isPromise ? "First CV in 10 minutes" : `Time to first CV: ${mmss}`}
    >
      <span className="tm-cv-promise-pulse" aria-hidden />
      <span className="tm-cv-promise-lbl">{isFinish ? "FINISH CV" : "FIRST CV IN"}</span>
      <span className="tm-cv-promise-time">
        {isPromise ? "10 min" : isFinish ? "00:00" : mmss}
      </span>
    </button>
  )
}
