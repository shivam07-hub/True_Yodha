/* MCQ runner. WCAG (PRD §9): role=radiogroup, arrow-key nav, roving tabindex,
   no auto-advance, explicit Next/Submit, untimed, Esc-to-exit (confirm).
   Desktop = full list; mobile = one question per screen. */

"use client"

import { useEffect, useRef, useState, type JSX } from "react"
import { useViewport } from "@/mobile"
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"
import { formatClock } from "./quiz-best"
import type { QuizQuestion } from "./types"

const OPT_LETTERS = ["A", "B", "C", "D"]

function QuestionGroup({
  question,
  qIndex,
  total,
  selected,
  onSelect,
  autoFocus = false,
}: {
  question: QuizQuestion
  qIndex: number
  total: number
  selected: number | null
  onSelect: (index: number) => void
  autoFocus?: boolean
}): JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null)
  const focusOption = (i: number) => {
    const btns = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    btns?.[i]?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = question.options.length
    const cur = selected == null ? 0 : selected
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      const next = (cur + 1) % n
      onSelect(next); focusOption(next)
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      const prev = (cur - 1 + n) % n
      onSelect(prev); focusOption(prev)
    } else if (e.key === " " || e.key === "Enter") {
      const idx = Number((e.target as HTMLElement).getAttribute("data-idx"))
      if (!Number.isNaN(idx)) { e.preventDefault(); onSelect(idx) }
    }
  }
  return (
    <div className="up-qcard up-card up-enter">
      <div className="up-qnum">Question {qIndex + 1} of {total}</div>
      <p className="up-qtext">{question.q}</p>
      <div
        ref={groupRef} className="up-options" role="radiogroup"
        aria-label={`Question ${qIndex + 1}: ${question.q}`} onKeyDown={onKeyDown}
      >
        {question.options.map((opt, i) => {
          const isSel = selected === i
          const roving = selected == null ? i === 0 : isSel
          return (
            <button
              key={i} type="button" role="radio" aria-checked={isSel} data-idx={i}
              tabIndex={roving ? 0 : -1}
              className={`up-opt${isSel ? " is-selected" : ""}`}
              onClick={() => onSelect(i)}
              ref={autoFocus && i === 0 && selected == null ? (el) => el?.focus({ preventScroll: true }) : null}
            >
              <span className="marker" aria-hidden="true">{isSel ? <Icon name="check" size={12} /> : OPT_LETTERS[i]}</span>
              <span className="opt-txt">{opt}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function QuizRunner({
  title,
  subtitle,
  questions,
  onSubmit,
  onExit,
  submitLabel = "Submit set",
}: {
  title: string
  subtitle: string
  questions: QuizQuestion[]
  onSubmit: (answers: Array<number | null>, elapsedSeconds: number) => void
  onExit: () => void
  submitLabel?: string
}): JSX.Element {
  const { isDesktop } = useViewport()
  const isMobile = !isDesktop
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null))
  const [current, setCurrent] = useState(0)
  const [showErr, setShowErr] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const answeredCount = answers.filter((a) => a != null).length
  const allAnswered = answeredCount === questions.length

  // Cosmetic speed stat (DEC-S2/S3): a passive stopwatch. Starts on mount (the
  // quiz screen render), counts up, never fails, aria-hidden so it adds no
  // time-pressure to the SR experience. Stops when the runner unmounts at
  // submit. elapsedRef is read at submit so the value isn't a stale closure.
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(0)
  useEffect(() => {
    const id = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const setAnswer = (qi: number, oi: number) => {
    setShowErr(false)
    setAnswers((prev) => { const n = [...prev]; n[qi] = oi; return n })
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmExit) { e.preventDefault(); setConfirmExit(true) }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [confirmExit])

  const goNext = () => {
    if (isMobile && answers[current] == null) { setShowErr(true); return }
    if (current < questions.length - 1) setCurrent((c) => c + 1)
  }
  const goBack = () => { if (current > 0) setCurrent((c) => c - 1) }
  const trySubmit = () => {
    if (!allAnswered) {
      setShowErr(true)
      const firstUn = answers.findIndex((a) => a == null)
      if (isMobile && firstUn >= 0) setCurrent(firstUn)
      return
    }
    onSubmit(answers, elapsedRef.current)
  }

  return (
    <div className="up-quiz" role="region" aria-label={`${title} quiz`}>
      <div className="up-quiz-bar">
        <div className="up-quiz-bar-inner">
          <div style={{ minWidth: 0 }}>
            <div className="q-skill">{title}</div>
            <div className="q-lvl">{subtitle}</div>
          </div>
          <div className="up-progress" aria-hidden="true"><i style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div>
          <span className="up-progress-txt">{answeredCount}/{questions.length}</span>
          <span className="up-quiz-clock" aria-hidden="true">{formatClock(elapsed)}</span>
          <Button variant="ghost" size="icon-md" className="up-quiz-x" aria-label="Exit quiz" onClick={() => setConfirmExit(true)}>
            <Icon name="close" size={16} />
          </Button>
        </div>
      </div>

      <div className="up-quiz-body">
        <div className="up-quiz-instr">
          <Icon name="sparkle" size={14} style={{ color: "var(--tm-interactive)" }} />
          One answer each · the clock never runs out. ↑↓ to move.
        </div>

        {isMobile ? (
          <>
            <QuestionGroup
              question={questions[current]} qIndex={current} total={questions.length}
              selected={answers[current]} onSelect={(oi) => setAnswer(current, oi)} autoFocus
            />
            {showErr && answers[current] == null && (
              <div role="alert" className="up-quiz-err">
                <Icon name="cross" size={13} /> Select an answer to continue.
              </div>
            )}
            <div className="up-quiz-foot">
              <Button variant="ghost" onClick={goBack} disabled={current === 0}>
                <Icon name="back" size={15} /> Back
              </Button>
              <div className="spacer" />
              <div className="up-quiz-dots" role="tablist" aria-label="Jump to question">
                {questions.map((_, i) => (
                  <button
                    key={i} type="button"
                    className={`up-qd${answers[i] != null ? " answered" : ""}${i === current ? " current" : ""}`}
                    aria-label={`Question ${i + 1}${answers[i] != null ? ", answered" : ""}`}
                    aria-current={i === current} onClick={() => setCurrent(i)}
                  />
                ))}
              </div>
              <div className="spacer" />
              {current < questions.length - 1 ? (
                <Button onClick={goNext}>Next <Icon name="arrow" size={15} /></Button>
              ) : (
                <Button onClick={trySubmit}>{submitLabel}</Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="up-qlist">
              {questions.map((q, i) => (
                <QuestionGroup key={i} question={q} qIndex={i} total={questions.length}
                  selected={answers[i]} onSelect={(oi) => setAnswer(i, oi)} />
              ))}
            </div>
            {showErr && !allAnswered && (
              <div role="alert" className="up-quiz-err up-quiz-err-list">
                <Icon name="cross" size={13} /> Answer all {questions.length} questions to submit — {questions.length - answeredCount} left.
              </div>
            )}
            <div className="up-quiz-foot" style={{ marginTop: 22 }}>
              <Button variant="ghost" onClick={() => setConfirmExit(true)}><Icon name="back" size={15} /> Exit</Button>
              <div className="spacer" />
              <span className="up-progress-txt">{answeredCount}/{questions.length} answered</span>
              <Button onClick={trySubmit} disabled={!allAnswered}>{submitLabel}</Button>
            </div>
          </>
        )}
      </div>

      {confirmExit && (
        <div className="up-scrim" role="dialog" aria-modal="true" aria-label="Exit quiz" onClick={() => setConfirmExit(false)}>
          <div className="up-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Exit this set?</h3>
            <p>Your answers won&apos;t be saved. The set isn&apos;t graded until you submit — you can always start a fresh set later.</p>
            <div className="up-modal-actions">
              <Button variant="ghost" onClick={() => setConfirmExit(false)}>Keep going</Button>
              <Button onClick={onExit}>Exit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
