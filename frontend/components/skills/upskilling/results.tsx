/* Graded results. WCAG (PRD §9): role=status announce + focus moved to heading
   on mount; correct/incorrect via icon + text (never color alone). */

"use client"

import { useEffect, useRef, type JSX } from "react"
import { Icon } from "./icons"
import { ScoreRing } from "./primitives"
import { formatClock } from "./quiz-best"
import { PROFICIENCY } from "./proficiency"
import type { ResultModel } from "./types"

export function Results({
  result,
  onPracticeAgain,
  onNextLevel,
  onBackToSkills,
}: {
  result: ResultModel
  onPracticeAgain: () => void
  onNextLevel: () => void
  onBackToSkills: () => void
}): JSX.Element {
  const {
    skillName, level, score, max, passed, firstClear, tokens, items, nextLevel, maxedOut,
    elapsedSeconds, prevBestSeconds, newBest,
  } = result
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])

  const cleared = passed
  const verdict = cleared ? (firstClear ? "Level cleared!" : "Cleared again") : "Not cleared yet"
  // Speed stat is display-only — deliberately NOT in the announce (DEC-S6).
  const announce = `${score} out of ${max}. ${cleared ? `Level ${level} cleared.` : "Not cleared."} ${tokens > 0 ? `${tokens} tokens earned.` : "No tokens earned."}`

  // Time line (DEC-S5): "best yet" on a first/faster clear, "best M:SS" on a
  // slower re-clear, plain "Time · M:SS" on a fail.
  const elapsedTxt = formatClock(elapsedSeconds)
  const timeLine = cleared && newBest
    ? `${elapsedTxt} · best yet`
    : cleared && prevBestSeconds != null
      ? `${elapsedTxt} · best ${formatClock(prevBestSeconds)}`
      : `Time · ${elapsedTxt}`

  return (
    <div className="up-results" role="region" aria-label="Set results">
      <div className="up-sr-only" role="status" aria-live="polite">{announce}</div>

      <section className={`up-card up-res-hero${cleared ? " cleared" : ""}`}>
        <ScoreRing score={score} max={max} cleared={cleared} />
        <div className="up-res-score">{skillName} · Level {level} · {PROFICIENCY[level]}</div>
        <h2 className={`up-res-verdict${cleared ? " cleared" : ""}`} ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>{verdict}</h2>
        <p className="up-res-sub">
          {cleared
            ? (firstClear
              ? <>You passed the bar (8/10). Tokens banked and the next level is open.</>
              : <>You&apos;ve already cleared this level — great recall. Re-clears earn 0 tokens, but practice is always free.</>)
            : <>You scored {score}/{max}. Clear <b>8/10</b> to earn — try a freshly drawn set, the questions rotate.</>}
        </p>

        {cleared ? (
          firstClear ? (
            <div className="up-res-award earned" role="status">
              <Icon name="coin" size={18} /> +{tokens} tokens earned
            </div>
          ) : (
            <div className="up-res-award zero"><Icon name="coin" size={14} /> +0 — already banked on first clear</div>
          )
        ) : (
          <div className="up-res-award zero"><Icon name="cross" size={14} /> Clear 8/10 to earn — you got {score}/10</div>
        )}

        <div className={`up-res-time${cleared && newBest ? " is-best" : ""}`} aria-hidden="true">{timeLine}</div>
      </section>

      {!maxedOut && (
        <div className={`up-res-unlock${cleared ? "" : " locked"}`}>
          {cleared
            ? <><Icon name="check" size={15} /> Level {nextLevel} ({PROFICIENCY[nextLevel]}) unlocked — keep climbing.</>
            : <><Icon name="lock" size={14} /> Level {nextLevel} ({PROFICIENCY[nextLevel]}) stays locked until you clear L{level}.</>}
        </div>
      )}
      {maxedOut && cleared && (
        <div className="up-res-unlock"><Icon name="star" size={15} /> That&apos;s the top — you&apos;re a Legend on {skillName}.</div>
      )}

      <div className="up-rev-list">
        <div className="up-review-h">Review · {score}/{max} correct</div>
        {items.map((it, i) => (
          <div key={i} className={`up-card up-rev ${it.isCorrect ? "correct" : "wrong"}`}>
            <div className="up-rev-top">
              <span className={`up-rev-tag ${it.isCorrect ? "correct" : "wrong"}`}>
                {it.isCorrect ? <><Icon name="check" size={13} /> Correct</> : <><Icon name="cross" size={13} /> Incorrect</>}
              </span>
              <span className="up-rev-num">Q{i + 1}</span>
            </div>
            <p className="up-rev-q">{it.q}</p>
            <div className="up-rev-ans">
              {it.isCorrect ? (
                <span className="key">✓ {it.options[it.correct]}</span>
              ) : (
                <>
                  <div className="you">Your answer: {it.selected != null ? it.options[it.selected] : "— skipped"}</div>
                  <div className="key">Correct: {it.options[it.correct]}</div>
                </>
              )}
            </div>
            <div className="up-rev-expl">{it.expl}</div>
          </div>
        ))}
      </div>

      <div className="up-res-actions">
        <button type="button" className="up-btn up-btn-ghost" onClick={onBackToSkills}><Icon name="back" size={15} /> Back to skills</button>
        <div style={{ flex: 1 }} />
        {cleared && !maxedOut ? (
          <>
            <button type="button" className="up-btn up-btn-outline" onClick={onPracticeAgain}>Practice L{level} again</button>
            <button type="button" className="up-btn up-btn-primary" onClick={onNextLevel}><Icon name="bolt" size={14} /> Start L{nextLevel}</button>
          </>
        ) : !cleared ? (
          <button type="button" className="up-btn up-btn-primary" onClick={onPracticeAgain}><Icon name="bolt" size={14} /> Try a fresh set</button>
        ) : (
          <button type="button" className="up-btn up-btn-outline" onClick={onPracticeAgain}>Practice again</button>
        )}
      </div>
    </div>
  )
}
