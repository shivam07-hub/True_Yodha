"use client"

import { Icon, Sparkline } from "./icons"
import { adaptiveGreeting } from "@/lib/mission-control/greeting"

interface CheckpointSpec {
  label: string
  done: boolean
}

interface HeroProps {
  name: string
  dateLine: string
  activeTargets: number
  checkpoints: CheckpointSpec[]
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
  checkpoints,
  score,
  streak,
  scoreDelta,
  loggedToday,
  sessions,
  sparkline,
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

        <div className="mc-checkpoints">
          {checkpoints.map((c) => (
            <div key={c.label} className={`mc-checkpoint ${c.done ? "done" : "todo"}`}>
              <span className="ring">{c.done ? <Icon name="check" size={11} stroke={2.4} /> : null}</span>
              <span className="label">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Boxless stat strip — hairline-divided columns (Firecrawl/Engine
          dashboard handoff). Score column carries the accent sparkline. */}
      <div className="mc-statstrip">
        <div className="mc-stat">
          <span className="mc-stat-label">Score · {sessions} ses</span>
          <span className="mc-stat-v">
            {score}
            <small>/100</small>
          </span>
          <div className="mc-stat-spark">
            <Sparkline data={sparkline} />
          </div>
        </div>
        <div className="mc-stat">
          <span className="mc-stat-label">Streak</span>
          <span className="mc-stat-v">
            {streak}
            <small>d</small>
          </span>
        </div>
        <div className="mc-stat">
          <span className="mc-stat-label">Sessions</span>
          <span className="mc-stat-v">
            {sessions}
            <small>total</small>
          </span>
        </div>
      </div>
    </div>
  )
}
