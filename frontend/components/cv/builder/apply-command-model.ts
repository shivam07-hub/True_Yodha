export type ApplyCommandPhase = "draft" | "ready" | "opened" | "applied"

export interface ApplyCommandInput {
  isDirty: boolean
  isApplied: boolean
  applyOpened: boolean
}

export interface ApplyCommandState {
  phase: ApplyCommandPhase
  status: string
  primaryLabel: string
  stepIndex: number
}

export function getApplyCommandState(input: ApplyCommandInput): ApplyCommandState {
  if (input.isDirty) {
    return {
      phase: "draft",
      status: "Unsaved draft",
      primaryLabel: "Save & preview",
      stepIndex: 0,
    }
  }
  if (input.isApplied) {
    return {
      phase: "applied",
      status: "Application tracked",
      primaryLabel: "View applications",
      stepIndex: 3,
    }
  }
  if (input.applyOpened) {
    return {
      phase: "opened",
      status: "Careers page opened",
      primaryLabel: "Mark applied",
      stepIndex: 2,
    }
  }
  return {
    phase: "ready",
    status: "Final preview ready",
    primaryLabel: "Preview & download",
    stepIndex: 1,
  }
}
