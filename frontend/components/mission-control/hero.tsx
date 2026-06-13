"use client"

import { LoopRing, type LoopStep } from "./loop-ring"
import { adaptiveGreeting } from "@/lib/mission-control/greeting"

interface HeroProps {
  name: string
  dateLine: string
  activeTargets: number
  steps: LoopStep[]
  score: number
  streak: number
  scoreDelta: number
  loggedToday: boolean
  sessions: number
  diaryEntries: number
  sparkline?: number[]
  /** "band" = full-width hero (legacy). "rail" = the pinned left column of the
   *  desktop workspace — greeting collapses to a one-line meta (D4). */
  variant?: "band" | "rail"
}

export function Hero({
  name,
  dateLine,
  activeTargets,
  steps,
  score,
  streak,
  scoreDelta,
  loggedToday,
  sessions,
  variant = "band",
}: HeroProps) {
  const greeting = adaptiveGreeting({ streak, scoreDelta, loggedToday })
  const targets = `${activeTargets} active target${activeTargets === 1 ? "" : "s"}`

  if (variant === "rail") {
    return (
      <div className="mc-rail">
        <div className="mc-rail-meta">
          <span className="mc-rail-hi">{greeting.text}, <strong>{name}</strong></span>
          <span className="mc-rail-sub">{dateLine} <span className="sep">·</span> {targets}</span>
        </div>
        <LoopRing score={score} scoreDelta={scoreDelta} streak={streak} sessions={sessions} steps={steps} />
      </div>
    )
  }

  return (
    <div className="mc-hero">
      <div>
        <h1 className="mc-greeting">
          {greeting.text}, <span className="mc-name">{name}</span>
          {greeting.emoji ? <span className="mc-greeting-glyph" aria-hidden> {greeting.emoji}</span> : null}
        </h1>
        <div className="mc-hero-sub">
          {dateLine} <span className="sep">·</span> {targets}
        </div>
      </div>

      {/* Daily-loop completion ring — Apple-Activity metaphor. Replaces the old
          checkpoint pill row + boxless stat strip with one focal tracker that
          nudges the user to close the loop. */}
      <LoopRing score={score} scoreDelta={scoreDelta} streak={streak} sessions={sessions} steps={steps} />
    </div>
  )
}
