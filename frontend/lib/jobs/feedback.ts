import { jobs, type FeedbackSurface, type PersonalReasonCode, type QualityReasonCode } from "@/lib/api"

/**
 * Job feedback taxonomy + firing helpers (Job Intelligence).
 *
 * Personal reasons are the user's own, and never touch global listing trust.
 * "Not my role" is the one that acts: `matching/passed_on` counts it across a
 * user's skips, and two inside 90 days stops Myro picking that direction (it
 * will never drop a direction the user chose themselves). The rest are recorded
 * and not yet read — which is what this comment used to claim about all of them
 * while nothing read any of them.
 *
 * Quality reasons move global confidence and are capped — they live behind a
 * deliberate "Report a problem" affordance, never the fast skip.
 */

/**
 * How long a "why?" stays on screen.
 *
 * The undo window is 6s on desktop and the snackbar 4.6s on the phone, which is
 * right for a reflex ("undo that") and wrong for a decision. The reasons wrap to
 * three rows at 375; a question that disappears while it is being read is worse
 * than not asking, because the user learns the answer does not matter.
 */
export const REASON_PROMPT_MS = 10_000

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
