import { XP_POLICY } from "@/lib/xp-policy"

export type RefreshNoticeKind = "success" | "error" | "info"
export type RefreshState =
  | "idle"
  | "charging"
  | "computing"
  | "done"
  | "error_insufficient_xp"
  | "error_failed"
export type RefreshOutcomeKind = "written" | "cache_hit" | "exhausted" | "needs_onboarding"

interface DeriveRefreshNoticeInput {
  state: RefreshState
  progressLabel: string | null
  matchesWritten: number | null
  errorMessage: string | null
  outcomeKind: RefreshOutcomeKind | null
}

export function deriveRefreshNotice({
  state,
  progressLabel,
  matchesWritten,
  errorMessage,
  outcomeKind,
}: DeriveRefreshNoticeInput): { msg: string; kind: RefreshNoticeKind } | null {
  if (state === "computing" || state === "charging") {
    return { msg: progressLabel ?? "Refreshing...", kind: "info" }
  }

  if (state === "done") {
    if (matchesWritten != null && matchesWritten > 0) {
      return { msg: `+${matchesWritten} new matches · -${XP_POLICY.matchRefreshCost} XP`, kind: "success" }
    }
    if (outcomeKind === "cache_hit") {
      return { msg: "Already current · XP refunded", kind: "info" }
    }
    if (outcomeKind === "needs_onboarding") {
      return { msg: "Upload CV to refresh matches · XP refunded", kind: "info" }
    }
    if (outcomeKind === "exhausted") {
      return { msg: "No strong matches in this pool · XP refunded", kind: "info" }
    }
    return { msg: "No new matches · XP refunded", kind: "info" }
  }

  if (state === "error_insufficient_xp" || state === "error_failed") {
    return { msg: errorMessage ?? "Refresh failed. Please try again.", kind: "error" }
  }

  return null
}
