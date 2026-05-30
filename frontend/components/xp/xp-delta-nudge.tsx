"use client"

import * as React from "react"
import { useXPStore } from "@/store/xpStore"
import "./xp-delta-nudge.css"

/**
 * Floats a `−10 XP` / `+30 XP` delta off the XP pill whenever an explicit
 * `applyXpChange` lands. Red = spend, green = earn. Design-over-words: ties the
 * deduction to where XP visibly lives, no text toast. Mount once inside each
 * pill (the pill must be `position: relative`).
 */
export function XpDeltaNudge() {
  const lastDelta = useXPStore((s) => s.lastDelta)
  const clearDelta = useXPStore((s) => s.clearDelta)
  const [shown, setShown] = React.useState<typeof lastDelta>(null)

  React.useEffect(() => {
    if (!lastDelta) return
    setShown(lastDelta)
    const t = setTimeout(() => {
      setShown(null)
      clearDelta()
    }, 1100)
    return () => clearTimeout(t)
  }, [lastDelta, clearDelta])

  if (!shown) return null
  const earn = shown.delta > 0
  return (
    <span
      key={shown.id}
      className="tm-xp-delta-nudge"
      data-dir={earn ? "earn" : "spend"}
      aria-hidden
    >
      {earn ? "+" : "−"}
      {Math.abs(shown.delta)}
    </span>
  )
}
