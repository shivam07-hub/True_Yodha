"use client"

import Link from "next/link"
import { Icon, type IconName } from "./icons"

export interface LoopStep {
  label: string
  done: boolean
  icon: IconName
  /** Where "close this step" routes. Omitted for on-page steps (e.g. Log). */
  href?: string
}

interface LoopRingProps {
  score: number
  scoreDelta: number
  streak: number
  sessions: number
  steps: LoopStep[]
}

// ── Ring geometry. Five segments laid on one circle, even gaps between them.
// The open arc is the call to action — the gap IS the nudge.
const R = 70
const STROKE = 12
const C = 2 * Math.PI * R // ≈ 439.82
const GAP = 20 // arc px between segments
const SEG = C / 5 - GAP // visible arc length per segment

/**
 * The daily loop as an Apple-Activity-style completion ring. The five ritual
 * steps (find → practice → log → level up → apply) are segments that close as
 * they're done; the Myro Score lives at the core. Closed = accent, open =
 * hairline track. One nudge points at the next open step. Streak + session
 * totals demote to quiet mono footnotes. Motion: a single staggered reveal on
 * load; an accent glow when the loop closes. Restraint over spectacle.
 */
export function LoopRing({ score, scoreDelta, streak, sessions, steps }: LoopRingProps) {
  const doneCount = steps.filter((s) => s.done).length
  const complete = doneCount === steps.length && steps.length > 0
  const next = steps.find((s) => !s.done)
  const nextActionable = steps.find((s) => !s.done && s.href)

  return (
    <div className={`mc-loopring${complete ? " is-complete" : ""}`}>
      <div className="mc-loopring-ring" role="img" aria-label={`Daily loop: ${doneCount} of ${steps.length} steps closed`}>
        <svg viewBox="0 0 168 168" className="mc-loopring-svg">
          {/* faint full-circle track */}
          <circle className="mc-loopring-track" cx="84" cy="84" r={R} strokeWidth={STROKE} fill="none" />
          {/* one segment per step, rotated so seg 0 starts at top */}
          <g transform="rotate(-90 84 84)">
            {steps.map((s, i) => (
              <circle
                key={s.label}
                className={`mc-loopring-seg ${s.done ? "is-done" : "is-open"}`}
                cx="84"
                cy="84"
                r={R}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${SEG} ${C - SEG}`}
                strokeDashoffset={-(i * (C / 5))}
                style={{ ["--i" as string]: i }}
              />
            ))}
          </g>
        </svg>

        <div className="mc-loopring-core">
          {complete ? (
            <span className="mc-loopring-core-badge" aria-hidden>
              <Icon name="check" size={26} stroke={2.6} />
            </span>
          ) : (
            <>
              <span className="mc-loopring-score">
                {score}
                <small>/100</small>
              </span>
              {scoreDelta > 0 ? <span className="mc-loopring-delta">▲ {scoreDelta}</span> : null}
            </>
          )}
          <span className="mc-loopring-count">
            {doneCount}<span className="sep">/</span>{steps.length} closed
          </span>
        </div>
      </div>

      {/* legend — five steps, done in accent, open as faint outlines */}
      <ul className="mc-loopring-legend">
        {steps.map((s) => (
          <li key={s.label} className={`mc-loopring-leg ${s.done ? "is-done" : "is-open"}`} title={s.label}>
            <span className="dot"><Icon name={s.done ? "check" : s.icon} size={11} stroke={2.2} /></span>
            <span className="lab">{s.label}</span>
          </li>
        ))}
      </ul>

      {/* nudge — points at the next open step */}
      {complete ? (
        <p className="mc-loopring-nudge is-complete">
          Loop closed today{streak > 0 ? ` · ${streak}-day streak` : ""}. Come back tomorrow.
        </p>
      ) : nextActionable ? (
        <Link href={nextActionable.href!} className="mc-loopring-nudge tm-control-focus">
          Close the loop — <strong>{nextActionable.label}</strong>
          <Icon name="arrowRight" size={13} stroke={2} />
        </Link>
      ) : next ? (
        <p className="mc-loopring-nudge">
          One step left — <strong>{next.label}</strong>.
        </p>
      ) : null}

      {/* quiet footnote — the old streak/sessions totals, demoted */}
      <div className="mc-loopring-foot">
        <span><b>{streak}</b>d streak</span>
        <span className="sep" aria-hidden>·</span>
        <span><b>{sessions}</b> sessions</span>
      </div>
    </div>
  )
}
