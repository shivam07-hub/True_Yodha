"use client"

import * as React from "react"
import Link from "next/link"
import { Icon, Sparkline } from "./icons"

interface CheckpointSpec {
  label: string
  done: boolean
}

interface NextMoveSpec {
  icon: "forge" | "cv" | "diary"
  title: string
  meta: string
  reward: string
  href?: string
  onClick?: () => void
  primary?: boolean
}

interface HeroProps {
  name: string
  dateLine: string
  activeTargets: number
  checkpoints: CheckpointSpec[]
  nextMoves: NextMoveSpec[]
  score: number
  streak: number
  sessions: number
  diaryEntries: number
  sparkline?: number[]
}

export function Hero({
  name,
  dateLine,
  activeTargets,
  checkpoints,
  nextMoves,
  score,
  streak,
  sessions,
  diaryEntries,
  sparkline,
}: HeroProps) {
  const greeting = useGreeting()
  return (
    <div className="mc-hero">
      <div>
        <div className="mc-mobile-mission-head">
          <div className="eyebrow">Mission Control</div>
          <h1>
            Today&apos;s <span>three moves.</span>
          </h1>
        </div>

        <h1 className="mc-greeting">
          {greeting}, <span className="mc-name">{name}</span>
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

        {nextMoves.length > 0 ? (
          <div className="mc-next-moves">
            <div className="mc-next-moves-head">
              <span className="eyebrow">Next moves</span>
              <span className="mc-count-bub">{nextMoves.length}</span>
            </div>
            <div className="mc-next-moves-list">
              {nextMoves.map((nm) => {
                const inner = (
                  <>
                    <span className="nm-glyph">
                      <Icon name={nm.icon} size={14} />
                    </span>
                    <span className="nm-body">
                      <span className="nm-title">{nm.title}</span>
                      <span className="nm-meta">{nm.meta}</span>
                    </span>
                    <span className="nm-reward mono">{nm.reward}</span>
                    <span className="nm-chev">
                      <Icon name="chev" size={12} />
                    </span>
                  </>
                )
                const cls = `mc-next-move tm-control-focus${nm.primary ? " is-primary" : ""}`
                if (nm.href) {
                  return (
                    <Link key={nm.title} href={nm.href} className={cls}>
                      {inner}
                    </Link>
                  )
                }
                return (
                  <button key={nm.title} type="button" className={cls} onClick={nm.onClick}>
                    {inner}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
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

function useGreeting(): string {
  return React.useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return "Good morning"
    if (h < 17) return "Good afternoon"
    return "Good evening"
  }, [])
}
