import assert from "node:assert/strict"
import test from "node:test"

import { ApiError, readTraceId, serverMessage } from "../lib/api-error"

test("readTraceId reads the API correlation header first", () => {
  const response = new Response(null, {
    headers: {
      "x-correlation-id": "correlation-from-header",
      "x-trace-id": "legacy-trace",
    },
  })

  assert.equal(
    readTraceId(response, { correlation_id: "correlation-from-body" }),
    "correlation-from-header",
  )
})

test("readTraceId falls back to the correlation ID response field", () => {
  const response = new Response(null)

  assert.equal(
    readTraceId(response, { correlation_id: "correlation-from-body" }),
    "correlation-from-body",
  )
})

test("serverMessage shows what the server said, and only when it answered", () => {
  const answered = new ApiError("Couldn't build the brief right now. Try again shortly — you were not charged.", {
    status: 503,
    kind: "http",
  })
  const unanswered = new ApiError("Request timed out.", { kind: "timeout" })

  assert.equal(serverMessage(answered, "fallback"), answered.message)
  assert.equal(serverMessage(unanswered, "fallback"), "fallback")
  assert.equal(serverMessage(new Error("boom"), "fallback"), "fallback")
})
