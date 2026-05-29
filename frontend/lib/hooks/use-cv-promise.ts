/* Ticking view-model for the 10-min CV-promise countdown pill (Q4).
 *
 * `phase`:
 *   - "promise"  → first-run, no clock yet (pre-upload). Show static "First CV in 10 min".
 *   - "running"  → clock live, mm:ss counting down.
 *   - "finish"   → expired. Gentle "FINISH CV" nudge — no shame, no reset.
 *   - "idle"     → not first-run (promise delivered) — pill hidden.
 *
 * Drives the topbar pill and the first-run hero eyebrow off one source so they
 * never disagree. Tick only runs while a deadline is live.
 */
import { useEffect, useState } from "react"
import { getCvDeadline, CV_PROMISE_SECONDS } from "@/lib/cv-promise"

export type CvPromisePhase = "idle" | "promise" | "running" | "finish"

export interface CvPromiseVm {
  phase: CvPromisePhase
  secondsLeft: number
  /** Zero-padded mm:ss. */
  mmss: string
}

function fmt(total: number): string {
  const s = Math.max(0, total)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m < 10 ? "0" : ""}${m}:${sec < 10 ? "0" : ""}${sec}`
}

/**
 * @param firstRun  operator hasn't delivered the promise yet (0 tailored CVs)
 * @param hasStarted  the journey has begun (a CV upload exists / is in flight)
 */
export function useCvPromise(firstRun: boolean, hasStarted: boolean): CvPromiseVm {
  const [secondsLeft, setSecondsLeft] = useState<number>(CV_PROMISE_SECONDS)

  useEffect(() => {
    if (!firstRun || !hasStarted) return
    function compute() {
      const dl = getCvDeadline()
      if (dl == null) {
        setSecondsLeft(CV_PROMISE_SECONDS)
        return
      }
      setSecondsLeft(Math.max(0, Math.round((dl - Date.now()) / 1000)))
    }
    compute()
    const id = setInterval(compute, 1000)
    return () => clearInterval(id)
  }, [firstRun, hasStarted])

  if (!firstRun) return { phase: "idle", secondsLeft: 0, mmss: "00:00" }
  if (!hasStarted || getCvDeadline() == null) {
    return { phase: "promise", secondsLeft: CV_PROMISE_SECONDS, mmss: fmt(CV_PROMISE_SECONDS) }
  }
  if (secondsLeft <= 0) return { phase: "finish", secondsLeft: 0, mmss: "00:00" }
  return { phase: "running", secondsLeft, mmss: fmt(secondsLeft) }
}
