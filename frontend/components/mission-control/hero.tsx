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
}: HeroProps) {
  const greeting = adaptiveGreeting({ streak, scoreDelta, loggedToday })
  return (
    <div className="mc-hero">
      <div>
        <h1 className="mc-greeting">
          {greeting.text}, <span className="mc-name">{name}</span>
          {greeting.emoji ? <span className="mc-greeting-glyph" aria-hidden> {greeting.emoji}</span> : null}
        </h1>
        <div className="mc-hero-sub">
          {dateLine} <span className="sep">·</span> {activeTargets} active target{activeTargets === 1 ? "" : "s"}
        </div>
      </div>

      {/* Daily-loop completion ring — Apple-Activity metaphor. Replaces the old
          checkpoint pill row + boxless stat strip with one focal tracker that
          nudges the user to close the loop. */}
      <LoopRing score={score} scoreDelta={scoreDelta} streak={streak} sessions={sessions} steps={steps} />
    </div>
  )
}
