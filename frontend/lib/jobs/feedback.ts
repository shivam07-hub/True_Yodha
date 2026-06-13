import { jobs, type FeedbackSurface, type PersonalReasonCode, type QualityReasonCode } from "@/lib/api"

/**
 * Job feedback taxonomy + firing helpers (Job Intelligence).
 *
 * Personal reasons train only the user's own ranking and never touch global
 * listing trust. Quality reasons move global confidence and are capped — they
 * live behind a deliberate "Report a problem" affordance, never the fast skip.
 */

export const PERSONAL_REASONS: { code: PersonalReasonCode; label: string }[] = [
  { code: "not_my_role", label: "Not my role" },
  { code: "location", label: "Wrong location" },
  { code: "seniority", label: "Seniority" },
  { code: "compensation", label: "Compensation" },
  { code: "company", label: "Company" },
  { code: "skills_gap", label: "Skills gap" },
  { code: "already_applied", label: "Already applied" },
]

export const QUALITY_REASONS: { code: QualityReasonCode; label: string }[] = [
  { code: "apply_link_closed", label: "Apply link is closed" },
  { code: "looks_old", label: "Looks old" },
  { code: "posting_inactive", label: "Posting inactive" },
  { code: "duplicate", label: "Duplicate listing" },
  { code: "details_wrong", label: "Details are wrong" },
]

/** Fire-and-forget personal feedback — never blocks or reverses the skip. */
export function sendPersonalFeedback(
  token: string,
  jobId: string,
  reason: PersonalReasonCode,
  surface: FeedbackSurface,
): void {
  void jobs
    .submitFeedback(token, {
      client_event_id: crypto.randomUUID(),
      job_id: jobId,
      feedback_kind: "personal",
      reason_code: reason,
      surface,
    })
    .catch(() => {
      /* feedback is best-effort; a failure must never disturb the curation loop */
    })
}
