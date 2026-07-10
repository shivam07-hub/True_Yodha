import type { JobFeedbackInput, QualityReasonCode } from "@/lib/api"

export interface FeedbackStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const DEFAULT_MAX_EVENTS = 100

export function feedbackReasonForLiveness(live: boolean): QualityReasonCode {
  return live ? "apply_link_live" : "apply_link_closed"
}

export function feedbackOutboxKey(token: string): string {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `myro.job-feedback-outbox.v1.${(hash >>> 0).toString(36)}`
}

export function readFeedbackOutbox(
  storage: FeedbackStorage,
  key: string,
): JobFeedbackInput[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isFeedbackInput)
  } catch {
    return []
  }
}

export function enqueueFeedback(
  storage: FeedbackStorage,
  key: string,
  event: JobFeedbackInput,
  maxEvents = DEFAULT_MAX_EVENTS,
): void {
  const current = readFeedbackOutbox(storage, key).filter(
    item => item.client_event_id !== event.client_event_id,
  )
  storage.setItem(key, JSON.stringify([...current, event].slice(-maxEvents)))
}

export async function flushFeedbackOutbox(
  storage: FeedbackStorage,
  key: string,
  send: (event: JobFeedbackInput) => Promise<unknown>,
): Promise<void> {
  const delivered = new Set<string>()
  for (const event of readFeedbackOutbox(storage, key)) {
    try {
      await send(event)
      delivered.add(event.client_event_id)
    } catch {
      // Remains queued for the next mount/online event.
    }
  }
  const current = readFeedbackOutbox(storage, key)
  storage.setItem(
    key,
    JSON.stringify(current.filter(item => !delivered.has(item.client_event_id))),
  )
}

function isFeedbackInput(value: unknown): value is JobFeedbackInput {
  if (!value || typeof value !== "object") return false
  const row = value as Partial<JobFeedbackInput>
  return (
    typeof row.client_event_id === "string" &&
    typeof row.job_id === "string" &&
    (row.feedback_kind === "personal" || row.feedback_kind === "quality") &&
    typeof row.reason_code === "string" &&
    typeof row.surface === "string"
  )
}
