/* Shared UI models for the Upskilling surface. Progress + bank readiness
   come from GET /upskilling/skills. Demand and skill state live on
   GET /career-skill-path — this ladder does not recompute them. */

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
  /** Live roles whose bar for this skill the user now clears. Null = say nothing. */
  payoff: { newlyMet: number; metTotal: number } | null
  certificate: {
    verification_id: string
    verify_path?: string
    cv_line: string
    skill_display_name: string
    achieved_level: number
  } | null
  /** Add-to-CV destination after a passing assessment issues a certificate. */
  cvHref: string | null
}
