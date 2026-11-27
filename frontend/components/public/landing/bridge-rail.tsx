"use client"

import { useEffect, useState } from "react"

interface Progress {
  steps: number
  filled: number
}

/** A chapter counts as crossed once its top passes this share of the viewport. */
const CROSSED_AT = 0.6

function measure(): Progress {
  const chapters = document.querySelectorAll<HTMLElement>("[data-bridge-step]")
  const line = window.innerHeight * CROSSED_AT
  let filled = 0
  chapters.forEach((chapter) => {
    if (chapter.getBoundingClientRect().top < line) filled += 1
  })
  return { steps: chapters.length, filled }
}

/**
 * Spec #66 Q12: the scroll device is a bridge, never a score. "Your CV" on one
 * end, "The job you want" on the other; one segment fills per chapter crossed.
 * Before upload there is no number to show, so it shows none. Chapters opt in
 * with `data-bridge-step`, and render late (they wait on the roles read), so the
 * count is retaken when <main>'s children change, and on scroll and resize.
 *
 * Visual only (aria-hidden): the chapters' own headings are the structure a
 * screen reader walks.
 */
export function BridgeRail() {
  const [progress, setProgress] = useState<Progress>({ steps: 0, filled: 0 })

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const next = measure()
      setProgress((prev) => (prev.steps === next.steps && prev.filled === next.filled ? prev : next))
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    // Chapters are direct children of <main>; watching only that list keeps the
    // live log's constant DOM churn from waking this up.
    const observer = new MutationObserver(schedule)
    const main = document.querySelector("main")
    if (main) observer.observe(main, { childList: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      observer.disconnect()
    }
  }, [])

  if (progress.steps < 2) return null
  const done = progress.filled >= progress.steps

  return (
    <div className="lp-bridge" aria-hidden="true">
      <div className="lp-wrap lp-bridge-inner">
        <span className="lp-bridge-end">Your CV</span>
        <span className="lp-bridge-dot" data-on="true" />
        <span className="lp-bridge-line">
          {Array.from({ length: progress.steps }, (_, i) => (
            <span key={i} className="lp-bridge-seg" data-on={i < progress.filled ? "true" : "false"} />
          ))}
        </span>
        <span className="lp-bridge-dot" data-on={done ? "true" : "false"} />
        <span className="lp-bridge-end">The job you want</span>
      </div>
    </div>
  )
}
