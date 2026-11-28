/**
 * One practice set, start to result — the parts every runner shares.
 *
 * `/practice` (UpskillingView) and a Preparation room's step 2 (LevelPractice,
 * ARCHITECTURE_ONE_PREP.md P2) both serve a set, grade it and show `Results`.
 * The grading mapping lives here once, so the two can never disagree about
 * what a pass, a best time or a certificate looks like.
 */
import type { StartSetResponse, SubmitSetResponse } from "@/lib/api"
import { addCertificateHref } from "@/lib/career-skill-path"
import { getBestSeconds, recordBestSeconds } from "./quiz-best"
import type { QuizQuestion, ResultModel } from "./types"

/** A served set as the runner holds it. */
export interface ServedSet {
  skillId: number
  skillName: string
  level: number
  setId: string
  idempotencyKey: string
  questions: QuizQuestion[]
}

export function servedSet(skillName: string, level: number, res: StartSetResponse): ServedSet {
  return {
    skillId: res.skill_id,
    skillName,
    level,
    setId: res.set_id,
    idempotencyKey: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${res.set_id}-${Date.now()}`,
    questions: res.questions.map((q) => ({ id: q.id, q: q.question_text, options: q.options })),
  }
}

export function answerPayload(
  questions: QuizQuestion[],
  answers: Array<number | null>,
): Array<{ question_id: number; selected_index: number }> {
  return questions.map((question, i) => ({
    question_id: question.id,
    selected_index: answers[i] ?? -1,
  }))
}

/** The graded set as `Results` renders it. Records a passing clear's time. */
export function resultOf(
  set: ServedSet,
  res: SubmitSetResponse,
  answers: Array<number | null>,
  elapsedSeconds: number,
): ResultModel {
  const byId = new Map(res.results.map((r) => [r.question_id, r]))
  const items = set.questions.map((question, i) => {
    const r = byId.get(question.id)
    return {
      q: question.q,
      options: question.options,
      correct: r ? r.correct_index : -1,
      selected: answers[i],
      isCorrect: r ? r.is_correct : false,
      expl: r ? r.explanation : "",
      rationales: r?.rationales,
    }
  })
  // Cosmetic speed stat (DEC-S4): record only a passing clear; read prior
  // best BEFORE writing so a slower re-clear can still show the best.
  let prevBestSeconds: number | null = null
  let newBest = false
  if (res.passed) {
    prevBestSeconds = getBestSeconds(set.skillId, set.level)
    newBest = recordBestSeconds(set.skillId, set.level, elapsedSeconds)
  }
  return {
    skillName: set.skillName,
    level: set.level,
    score: res.score,
    max: res.max,
    passed: res.passed,
    firstClear: res.first_clear,
    tokens: res.tokens_awarded,
    items,
    nextLevel: res.next_level_unlocked ?? Math.min(set.level + 1, 5),
    maxedOut: set.level >= 5,
    elapsedSeconds,
    prevBestSeconds,
    newBest,
    // Only when a live role actually asks for this skill — the backend
    // returns null rather than zeroes so there is nothing to suppress here.
    payoff: res.passed && res.payoff && res.payoff.met_total > 0
      ? { newlyMet: res.payoff.newly_met, metTotal: res.payoff.met_total }
      : null,
    certificate: res.passed ? (res.certificate ?? null) : null,
    cvHref: res.passed && res.certificate?.verification_id
      ? addCertificateHref(res.certificate.verification_id)
      : null,
  }
}
