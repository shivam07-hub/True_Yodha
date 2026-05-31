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
  diaryEntries,
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

      <div className="mc-score-panel">
        <div className="mc-score-eyebrow">
          <span className="glyph">
            <Icon name="star" size={11} />
          </span>
          Score · Last {sessions} session{sessions === 1 ? "" : "s"}
        </div>
        <div className="mc-score-big">
          <span className="num">{score}</span>
          <span className="denom">/100</span>
        </div>

        <div className="mc-score-stats">
          <div className="mc-score-stat">
            <div className="lbl">
              <span className="glyph">🔥</span> Streak
            </div>
            <div className="val">
              <span className="v">{streak}</span>
              <span className="u">d</span>
            </div>
          </div>
          <div className="mc-score-stat">
            <div className="lbl">
              <span className="glyph">●</span> Sessions
            </div>
            <div className="val">
              <span className="v">{sessions}</span>
              <span className="u">total</span>
            </div>
          </div>
        </div>

        <div className="mc-diary-line">
          {diaryEntries} Diary entr{diaryEntries === 1 ? "y" : "ies"} logged
        </div>
        <Sparkline data={sparkline} />
      </div>
    </div>
  )
}
