import type { QualityReasonCode } from "@/lib/api"

export type ApplyReturnAnswer = "submitted" | "not_yet" | "couldnt"
export type ApplyIssue = "link_gone" | "wrong_page" | "wrong_role" | "technical"
export type ApplyReturnStep = "idle" | "asking" | "issue" | "saved" | "submitted" | "reported" | "error"

export interface ApplyReturnState {
  step: ApplyReturnStep
}

export function beginApplyReturn(): ApplyReturnState {
  return { step: "asking" }
}

export function answerApplyReturn(answer: ApplyReturnAnswer): ApplyReturnState {
  if (answer === "submitted") return { step: "submitted" }
  if (answer === "not_yet") return { step: "saved" }
  return { step: "issue" }
}

export function issueFeedbackReason(issue: ApplyIssue): QualityReasonCode {
  const reasons: Record<ApplyIssue, QualityReasonCode> = {
    link_gone: "apply_link_closed",
    wrong_page: "apply_redirected",
    wrong_role: "apply_wrong_role",
    technical: "apply_technical_error",
  }
  return reasons[issue]
}
