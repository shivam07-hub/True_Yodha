"use client"

/**
 * LevelPractice — one level's set, run inside its step-2 row
 * (ARCHITECTURE_ONE_PREP.md P2).
 *
 * Step 2 used to say "You're L1 · this job asks L3" and then send the person to
 * /practice to do the thing the room was asking for. The set now runs where
 * the ask is: the same ten questions, the same grading (`set-result.ts`), the
 * same `Results`. A pass writes `skill_assessed_level` on the server, so every
 * room that asks for this skill shows the new level on its next ladder read —
 * the carry the room's band promises.
 *
 * The set is started by taxonomy key and carries the room's job, so practice in
 * a room is countable (`quiz_attempts.job_id`).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { upskilling } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useParticleMoment } from "@/components/particle"
import { Button } from "@/components/ui/button"
import { QuizRunner } from "@/components/skills/upskilling/quiz-runner"
import { Results } from "@/components/skills/upskilling/results"
import { PROFICIENCY } from "@/components/skills/upskilling/proficiency"
import { answerPayload, resultOf, servedSet, type ServedSet } from "@/components/skills/upskilling/set-result"
import type { ResultModel } from "@/components/skills/upskilling/types"

type Phase =
  | { kind: "starting"; level: number }
  | { kind: "quiz"; set: ServedSet }
  | { kind: "results"; result: ResultModel }
  | { kind: "stopped"; message: string }

export function LevelPractice({
  token,
  skillKey,
  skillName,
  level,
  jobId,
  onClose,
}: {
  token: string
  skillKey: string
  skillName: string
  /** The level to start at: the next one above what the person holds. */
  level: number
  /** The job room this runs in; null in the target-role room. */
  jobId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fireMoment = useParticleMoment()
  const [phase, setPhase] = React.useState<Phase>({ kind: "starting", level })

  const start = React.useCallback(async (next: number) => {
    setPhase({ kind: "starting", level: next })
    try {
      const res = await upskilling.startSet(token, skillKey, next, jobId)
      setPhase({ kind: "quiz", set: servedSet(skillName, next, res) })
    } catch (error) {
      // The server says why in words a person can read: the skill has no
      // five-level ladder, or this level's bank is still being written.
      setPhase({
        kind: "stopped",
        message: error instanceof Error && error.message
          ? error.message
          : `L${next} ${skillName} questions are still being written.`,
      })
    }
  }, [token, skillKey, skillName, jobId])

  // Opening the row draws ONE set. Starting writes a `quiz_attempts` row, and a
  // development double-run of this effect drew two (seen 2026-11-28: two
  // attempts 0.4 ms apart). The ref survives that re-run; a new level asked for
  // by the row starts a new set.
  const drawnFor = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (drawnFor.current === level) return
    drawnFor.current = level
    void start(level)
  }, [start, level])

  async function submit(answers: Array<number | null>, elapsedSeconds: number) {
    if (phase.kind !== "quiz") return
    const set = phase.set
    try {
      const res = await upskilling.submitSet(
        token, set.setId, answerPayload(set.questions, answers), set.idempotencyKey,
      )
      setPhase({ kind: "results", result: resultOf(set, res, answers, elapsedSeconds) })
      if (res.tokens_awarded > 0) {
        window.setTimeout(() => fireMoment({ intensity: 1.5 }), 240)
      }
      if (res.passed) {
        // Every room's rung for this skill, the role room and /practice's list.
        void queryClient.invalidateQueries({ queryKey: dataKeys.prepLadder() })
        void queryClient.invalidateQueries({ queryKey: dataKeys.careerSkillPath() })
        void queryClient.invalidateQueries({ queryKey: ["upskilling-skills"] })
      }
    } catch {
      setPhase({ kind: "stopped", message: "Couldn’t grade this set — check your connection and try again." })
    }
  }

  if (phase.kind === "starting") {
    return <p className="prp-quiet">Drawing ten L{phase.level} questions…</p>
  }
  if (phase.kind === "stopped") {
    return (
      <div className="prp-level-stopped">
        <p className="prp-quiet">{phase.message}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    )
  }
  if (phase.kind === "quiz") {
    return (
      <QuizRunner
        title={`${skillName} · Level ${phase.set.level}`}
        subtitle={`${PROFICIENCY[phase.set.level]} · clear 8/10 to earn`}
        questions={phase.set.questions}
        onSubmit={submit}
        onExit={onClose}
      />
    )
  }
  const { result } = phase
  return (
    <Results
      result={result}
      backLabel="Back to levels"
      onBackToSkills={onClose}
      onPracticeAgain={() => void start(result.level)}
      onNextLevel={() => void start(result.nextLevel)}
      onImproveCv={(href) => router.push(href)}
    />
  )
}
