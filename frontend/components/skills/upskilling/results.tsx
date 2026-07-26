/* Graded results. WCAG (PRD §9): role=status announce + focus moved to heading
   on mount; correct/incorrect via icon + text (never color alone). */

"use client"

import { useEffect, useRef, type JSX } from "react"
import { Button } from "@/components/ui/button"
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
  onImproveCv,
}: {
  result: ResultModel
  onPracticeAgain: () => void
  onNextLevel: () => void
  onBackToSkills: () => void
  onImproveCv: (href: string) => void
}): JSX.Element {
  const {
    skillName, level, score, max, passed, firstClear, tokens, items, nextLevel, maxedOut,
    elapsedSeconds, prevBestSeconds, newBest, mentorHref,
  } = result
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])

  const cleared = passed
  const verdict = cleared ? (firstClear ? "Level cleared!" : "Cleared again") : "Not cleared yet"
  // Speed stat is display-only — deliberately NOT in the announce (DEC-S6).
  const announce = `${score} out of ${max}. ${cleared ? `Level ${level} cleared.` : "Not cleared."} ${tokens > 0 ? `${tokens} Myro Coins earned.` : "No Myro Coins earned."}`

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
              ? <>You passed the bar (8/10). Myro Coins banked and your level progress is recorded.</>
              : <>You&apos;ve already cleared this level — great recall. Re-clears earn 0 Myro Coins, but practice is always free.</>)
            : <>You scored {score}/{max}. Clear <b>8/10</b> to earn — try a freshly drawn set, the questions rotate.</>}
        </p>

        {cleared ? (
          firstClear ? (
            <div className="up-res-award earned" role="status">
              <Icon name="coin" size={18} /> +{tokens} Myro Coins earned
            </div>
          ) : (
            <div className="up-res-award zero"><Icon name="coin" size={14} /> +0 — already banked on first clear</div>
          )
        ) : (
          <div className="up-res-award zero"><Icon name="cross" size={14} /> Clear 8/10 to earn — you got {score}/10</div>
        )}

        <div className={`up-res-time${cleared && newBest ? " is-best" : ""}`} aria-hidden="true">{timeLine}</div>
        {cleared && mentorHref ? (
          <Button className="up-res-mentor" onClick={() => onImproveCv(mentorHref)}>
            <Icon name="sparkle" size={14} /> Improve CV with Mentor
          </Button>
        ) : null}
      </section>

      {!maxedOut && (
        <div className="up-res-unlock">
          {cleared
            ? <><Icon name="check" size={15} /> Level {nextLevel} ({PROFICIENCY[nextLevel]}) is open — keep climbing.</>
            : <><Icon name="bolt" size={14} /> Levels stay available for practice. Clear L{level} when ready to bank Myro Coins.</>}
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
            {it.rationales ? (
              <div className="up-rev-expl">
                {it.rationales.correct ? (
                  <div>Correct: {it.rationales.correct}</div>
                ) : null}
                {it.rationales.distractors ? (
                  it.options.map((option, idx) => (
                    idx === it.correct ? null : (
                      <div key={idx}>Not {option}: {it.rationales?.distractors?.[String(idx)]}</div>
                    )
                  ))
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="up-res-actions">
        <Button variant="ghost" onClick={onBackToSkills}><Icon name="back" size={15} /> Back to skills</Button>
        <div style={{ flex: 1 }} />
        {cleared && !maxedOut ? (
          <>
            <Button variant="outline" onClick={onPracticeAgain}>Practice L{level} again</Button>
            <Button variant={mentorHref ? "outline" : "solid"} onClick={onNextLevel}><Icon name="bolt" size={14} /> Start L{nextLevel}</Button>
          </>
        ) : !cleared ? (
          <Button onClick={onPracticeAgain}><Icon name="bolt" size={14} /> Try a fresh set</Button>
        ) : (
          <Button variant="outline" onClick={onPracticeAgain}>Practice again</Button>
        )}
      </div>
    </div>
  )
}
