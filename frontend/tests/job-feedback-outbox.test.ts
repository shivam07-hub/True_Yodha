import test from "node:test"
import assert from "node:assert/strict"

import {
  enqueueFeedback,
  feedbackReasonForLiveness,
  flushFeedbackOutbox,
  readFeedbackOutbox,
  type FeedbackStorage,
} from "../lib/jobs/feedback-outbox"

function memoryStorage(): FeedbackStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

const event = (id: string) => ({
  client_event_id: id,
  job_id: `job-${id}`,
  feedback_kind: "quality" as const,
  reason_code: "apply_link_live" as const,
  surface: "market" as const,
})

test("liveness answers map to durable positive and negative signals", () => {
  assert.equal(feedbackReasonForLiveness(true), "apply_link_live")
  assert.equal(feedbackReasonForLiveness(false), "apply_link_closed")
})

test("outbox deduplicates by client event id and stays bounded", () => {
  const storage = memoryStorage()
  enqueueFeedback(storage, "queue", event("same"), 2)
  enqueueFeedback(storage, "queue", event("same"), 2)
  enqueueFeedback(storage, "queue", event("new"), 2)
  enqueueFeedback(storage, "queue", event("newest"), 2)

  assert.deepEqual(
    readFeedbackOutbox(storage, "queue").map(item => item.client_event_id),
    ["new", "newest"],
  )
})

test("flush removes delivered events but retains failures for retry", async () => {
  const storage = memoryStorage()
  enqueueFeedback(storage, "queue", event("ok"))
  enqueueFeedback(storage, "queue", event("retry"))

  await flushFeedbackOutbox(storage, "queue", async item => {
    if (item.client_event_id === "retry") throw new Error("offline")
  })

  assert.deepEqual(
    readFeedbackOutbox(storage, "queue").map(item => item.client_event_id),
    ["retry"],
  )
})
