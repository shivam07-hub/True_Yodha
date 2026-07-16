"use client"

/**
 * DrillPanel — the job's calibration quiz INLINE in the prep room (grill Q6
 * amendment: practice questions render ON the surface, not hidden behind the
 * left rail). Reuses the existing gap flow end-to-end: startGap → QuizRunner
 * (the canonical up-* kit) → submitGap → compact readiness rows. Forge keeps
 * the full ladder; this is the room's own drill moment for THIS job's skills.
 */

import * as React from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { upskilling, type ReadinessRow, type StartGapResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { QuizRunner } from "@/components/skills/upskilling/quiz-runner"
import type { QuizQuestion } from "@/components/skills/upskilling/types"
import { Icon } from "@/components/skills/upskilling/icons"

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "quiz"; assessmentId: string; questions: QuizQuestion[] }
  | { kind: "done"; readiness: ReadinessRow[]; overallPct: number }
  | { kind: "empty"; reason: "no_gaps" | "no_bank" }
  | { kind: "error" }

const BAND_GLYPH: Record<ReadinessRow["band"], string> = { ready: "●", close: "◐", gap: "○" }
const BAND_CLS: Record<ReadinessRow["band"], string> = { ready: "covered", close: "weak", gap: "gap" }

export function DrillPanel({ token, jobId }: { token: string; jobId: string }) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" })

  async function start() {
    setPhase({ kind: "starting" })
    try {
      const res: StartGapResponse = await upskilling.startGap(token, jobId)
      const questions: QuizQuestion[] = res.skills.flatMap((s) =>
        s.calibration_set.map((q) => ({ id: q.id, q: q.question_text, options: q.options })),
      )
      if (questions.length === 0) {
        setPhase({ kind: "empty", reason: res.reason === "no_gaps" ? "no_gaps" : "no_bank" })
        return
      }
      setPhase({ kind: "quiz", assessmentId: res.assessment_id, questions })
    } catch {
      setPhase({ kind: "error" })
    }
  }

  async function submit(answers: Array<number | null>) {
    if (phase.kind !== "quiz") return
    const payload = phase.questions.map((q, i) => ({
      question_id: q.id,
      selected_index: answers[i] ?? -1,
    }))
    try {
      const res = await upskilling.submitGap(token, jobId, phase.assessmentId, payload)
      setPhase({ kind: "done", readiness: res.readiness, overallPct: res.overall_readiness_pct })
      // The diagnostic writes assessed levels server-side — refresh the ladder.
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
    } catch {
      setPhase({ kind: "error" })
    }
  }

  if (phase.kind === "idle" || phase.kind === "starting") {
    return (
      <div>
        <p className="prp-sec-note" style={{ marginBottom: 10 }}>
          A short question set on the skills this job tests — see where you stand before they ask.
        </p>
        <button type="button" className="prp-btn" onClick={() => void start()} disabled={phase.kind === "starting"}>
          {phase.kind === "starting" ? "Preparing questions…" : "Start the drill"}
        </button>
      </div>
    )
  }

  if (phase.kind === "empty") {
    return (
      <p className="prp-quiet">
        {phase.reason === "no_gaps"
          ? "Your CV already meets this job's required skill levels — nothing to drill."
          : "No drill questions for this job's skills yet — the rehearsal above is the prep."}
      </p>
    )
  }

  if (phase.kind === "error") {
    return (
      <p className="prp-quiet">
        Couldn&rsquo;t load the drill.{" "}
        <button type="button" className="prp-req-action" onClick={() => void start()}>Try again</button>
      </p>
    )
  }

  if (phase.kind === "quiz") {
    return (
      <div className="prp-drill-wrap up-root">
        <QuizRunner
          title="Skill drill"
          subtitle="The skills this job tests"
          questions={phase.questions}
          onSubmit={(answers) => void submit(answers)}
          onExit={() => setPhase({ kind: "idle" })}
          submitLabel="Check my answers"
        />
      </div>
    )
  }

  // done — compact readiness rows, forge link for deep practice.
  return (
    <div>
      <div className="prp-cov-bar">
        <span className="prp-cov-num">{phase.overallPct}% ready</span>
        <div className="prp-cov-track" role="progressbar" aria-valuenow={phase.overallPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="prp-cov-fill" style={{ width: `${phase.overallPct}%` }} />
        </div>
        <button type="button" className="prp-req-action" onClick={() => void start()}>Drill again</button>
      </div>
      {phase.readiness.map((row) => (
        <div key={row.skill_id} className="prp-req">
          <span className={`prp-req-marker ${BAND_CLS[row.band]}`} aria-hidden>{BAND_GLYPH[row.band]}</span>
          <div className="prp-req-main">
            <div className="prp-req-text">{row.skill}</div>
            <div className="prp-req-story">
              L{row.assessed_level} now · this job asks L{row.target_level}
            </div>
          </div>
          {row.band !== "ready" ? (
            <Link href={row.practice_href || "/forge"} className="prp-req-action" style={{ textDecoration: "none" }}>
              Level up <Icon name="bolt" size={10} />
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  )
}
