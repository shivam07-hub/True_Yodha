export const ROLE_STREAMS = ["Product", "Design", "Marketing", "Operations", "Other"] as const
export const DEVICE_TYPES = ["Mobile", "Laptop", "Desktop", "Tablet"] as const
export const OPERATING_SYSTEMS = ["Android", "iOS", "Windows", "macOS", "Linux", "Other"] as const
export const BROWSERS = ["Chrome", "Safari", "Edge", "Firefox", "Other"] as const
export const CONNECTION_TYPES = ["Wi-Fi", "Mobile data", "Mixed", "Unknown"] as const
export const SESSION_OUTCOMES = ["Completed", "Partial", "Blocked before a result"] as const
export const TIME_TO_VALUE_OPTIONS = [
  "Under 5 minutes",
  "5-10 minutes",
  "11-20 minutes",
  "21-30 minutes",
  "No useful result",
] as const
export const PRODUCT_AREAS = [
  "Landing and signup",
  "CV upload",
  "CV analysis or Myro Score",
  "CV Hub or tailoring",
  "Skills or Forge",
  "Jobs or matches",
  "Intel",
  "Tracker",
  "Diary",
  "Settings or feedback",
  "Other",
] as const

type Option<T extends readonly string[]> = T[number]

export interface BetaFeedbackDraft {
  role_stream: Option<typeof ROLE_STREAMS> | ""
  device_type: Option<typeof DEVICE_TYPES> | ""
  operating_system: Option<typeof OPERATING_SYSTEMS> | ""
  browser: Option<typeof BROWSERS> | ""
  connection_type: Option<typeof CONNECTION_TYPES> | ""
  session_outcome: Option<typeof SESSION_OUTCOMES> | ""
  time_to_value: Option<typeof TIME_TO_VALUE_OPTIONS> | ""
  areas_explored: Array<Option<typeof PRODUCT_AREAS>>
  product_understanding: string
  most_useful_moment: string
  biggest_problem_area: Option<typeof PRODUCT_AREAS> | ""
  biggest_problem: string
  attempted_action: string
  expected_result: string
  actual_result: string
  reproduction_steps: string
  priority_improvement: string
  priority_reason: string
  preserve: string
  return_trigger: string
  rating_next_step: number | null
  rating_trust: number | null
  rating_relevance: number | null
  rating_return: number | null
  rating_recommend: number | null
  privacy_confirmation: boolean
  independent_work_confirmation: boolean
  final_submission_confirmation: boolean
}

export interface BetaAssignmentReceipt {
  id: number
  submitted_at: string
}

export interface BetaAssignmentStatus {
  submitted: boolean
  receipt: BetaAssignmentReceipt | null
}

export type BetaFeedbackErrors = Partial<Record<keyof BetaFeedbackDraft, string>>

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const DRAFT_VERSION = 1

export function initialBetaFeedbackDraft(): BetaFeedbackDraft {
  return {
    role_stream: "",
    device_type: "",
    operating_system: "",
    browser: "",
    connection_type: "",
    session_outcome: "",
    time_to_value: "",
    areas_explored: [],
    product_understanding: "",
    most_useful_moment: "",
    biggest_problem_area: "",
    biggest_problem: "",
    attempted_action: "",
    expected_result: "",
    actual_result: "",
    reproduction_steps: "",
    priority_improvement: "",
    priority_reason: "",
    preserve: "",
    return_trigger: "",
    rating_next_step: null,
    rating_trust: null,
    rating_relevance: null,
    rating_return: null,
    rating_recommend: null,
    privacy_confirmation: false,
    independent_work_confirmation: false,
    final_submission_confirmation: false,
  }
}

export function validateSessionStep(draft: BetaFeedbackDraft): BetaFeedbackErrors {
  const errors: BetaFeedbackErrors = {}
  const required: Array<keyof BetaFeedbackDraft> = [
    "role_stream",
    "device_type",
    "operating_system",
    "browser",
    "connection_type",
    "session_outcome",
    "time_to_value",
  ]
  for (const field of required) {
    if (!draft[field]) errors[field] = "Choose an option."
  }
  if (draft.areas_explored.length === 0) {
    errors.areas_explored = "Select at least one area."
  }
  return errors
}

function validateText(value: string, required = true): string | null {
  const length = value.trim().length
  if (!required && length === 0) return null
  if (length < 10) return "Write at least 10 characters."
  if (length > 2000) return "Keep this answer under 2,000 characters."
  return null
}

export function validateAssessmentStep(draft: BetaFeedbackDraft): BetaFeedbackErrors {
  const errors: BetaFeedbackErrors = {}
  const required: Array<keyof BetaFeedbackDraft> = [
    "product_understanding",
    "most_useful_moment",
    "biggest_problem",
    "attempted_action",
    "expected_result",
    "actual_result",
    "priority_improvement",
    "priority_reason",
    "preserve",
    "return_trigger",
  ]
  if (!draft.biggest_problem_area) errors.biggest_problem_area = "Choose an area."
  for (const field of required) {
    const error = validateText(String(draft[field]))
    if (error) errors[field] = error
  }
  const reproductionError = validateText(draft.reproduction_steps, false)
  if (reproductionError) errors.reproduction_steps = reproductionError
  return errors
}

export function validateReviewStep(draft: BetaFeedbackDraft): BetaFeedbackErrors {
  const errors: BetaFeedbackErrors = {}
  const ratings: Array<keyof BetaFeedbackDraft> = [
    "rating_next_step",
    "rating_trust",
    "rating_relevance",
    "rating_return",
    "rating_recommend",
  ]
  for (const field of ratings) {
    const rating = draft[field]
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      errors[field] = "Choose a rating."
    }
  }
  if (!draft.privacy_confirmation) {
    errors.privacy_confirmation = "Confirm that no CV or personal information is attached."
  }
  if (!draft.independent_work_confirmation) {
    errors.independent_work_confirmation = "Confirm that these are your observations."
  }
  if (!draft.final_submission_confirmation) {
    errors.final_submission_confirmation = "Confirm that you can send this optional feedback once."
  }
  return errors
}

export function betaFeedbackDraftKey(userId: string): string {
  return `myro.beta-feedback.v1.${userId}`
}

export function loadBetaFeedbackDraft(
  userId: string,
  storage: DraftStorage | null,
): BetaFeedbackDraft {
  if (!storage) return initialBetaFeedbackDraft()
  try {
    const raw = storage.getItem(betaFeedbackDraftKey(userId))
    if (!raw) return initialBetaFeedbackDraft()
    const parsed = JSON.parse(raw) as { version?: unknown; draft?: unknown }
    if (parsed.version !== DRAFT_VERSION || typeof parsed.draft !== "object" || parsed.draft === null) {
      return initialBetaFeedbackDraft()
    }
    const draft = parsed.draft as Partial<BetaFeedbackDraft>
    if (!Array.isArray(draft.areas_explored)) return initialBetaFeedbackDraft()
    return { ...initialBetaFeedbackDraft(), ...draft }
  } catch {
    return initialBetaFeedbackDraft()
  }
}

export function saveBetaFeedbackDraft(
  userId: string,
  draft: BetaFeedbackDraft,
  storage: DraftStorage | null,
): void {
  storage?.setItem(
    betaFeedbackDraftKey(userId),
    JSON.stringify({ version: DRAFT_VERSION, draft }),
  )
}

export function clearBetaFeedbackDraft(
  userId: string,
  storage: DraftStorage | null,
): void {
  storage?.removeItem(betaFeedbackDraftKey(userId))
}
