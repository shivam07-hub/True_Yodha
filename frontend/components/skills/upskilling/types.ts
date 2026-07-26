/* Shared UI models for the Upskilling surface. The backend `UpskillingSkill`
   (progress + bank readiness) is merged with `buildPracticeSkills` demand
   signal into a single `LadderSkill` the cards consume. */

import type { DemandBand } from "@/lib/api"

export interface AnswerRationales {
  correct?: string
  distractors?: Record<string, string>
}

export interface LadderSkill {
  skillId: number
  key: string
  name: string
  clearedLevel: number
  assessedLevel: number
  nextLevel: number
  onCV: boolean
  demand: DemandBand
  jobCount: number
  /** The user's own learning intent — how many of THEIR jobs upvoted this
      skill from the job drawer. Leads practice ordering. */
  upvotes: number
  maxBankLevel: number
  locked: boolean
  /** Stored CV evidence exists; a quiz pass alone never creates CV evidence. */
  hasCvEvidence: boolean
}

/** A question as the runner consumes it (answer key withheld until grading). */
export interface QuizQuestion {
  id: number
  q: string
  options: string[]
}

/** One graded question, joined from the served question + the submit verdict. */
export interface ReviewItem {
  q: string
  options: string[]
  correct: number
  selected: number | null
  isCorrect: boolean
  expl: string
  rationales?: AnswerRationales
}

export interface ResultModel {
  skillName: string
  level: number
  score: number
  max: number
  passed: boolean
  firstClear: boolean
  tokens: number
  items: ReviewItem[]
  nextLevel: number
  maxedOut: boolean
  /** Cosmetic speed stat (DEC-S5). Elapsed run time; prior best (null = none);
      newBest = this passing clear beat the prior best (or was the first). */
  elapsedSeconds: number
  prevBestSeconds: number | null
  newBest: boolean
  /** Existing Mentor destination, or null when no real CV evidence exists. */
  mentorHref: string | null
}
