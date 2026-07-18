import test from "node:test"
import assert from "node:assert/strict"

import {
  enqueueApplyIntent,
  flushApplyIntentOutbox,
  readApplyIntentOutbox,
  type ApplyIntentStorage,
} from "../lib/jobs/apply-intent-outbox"

function memoryStorage(): ApplyIntentStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

const attempt = (id: string) => ({
  client_event_id: id,
  job_id: `job-${id}`,
  surface: "market" as const,
  destination_type: "direct_role" as const,
})

test("apply-attempt outbox deduplicates retries by client event id", () => {
  const storage = memoryStorage()
  enqueueApplyIntent(storage, "queue", attempt("same"))
  enqueueApplyIntent(storage, "queue", attempt("same"))

  assert.deepEqual(readApplyIntentOutbox(storage, "queue"), [attempt("same")])
})

test("apply-attempt outbox retains offline failures", async () => {
  const storage = memoryStorage()
  enqueueApplyIntent(storage, "queue", attempt("ok"))
  enqueueApplyIntent(storage, "queue", attempt("retry"))

  await flushApplyIntentOutbox(storage, "queue", async event => {
    if (event.client_event_id === "retry") throw new Error("offline")
  })

  assert.deepEqual(
    readApplyIntentOutbox(storage, "queue").map(event => event.client_event_id),
    ["retry"],
  )
})
